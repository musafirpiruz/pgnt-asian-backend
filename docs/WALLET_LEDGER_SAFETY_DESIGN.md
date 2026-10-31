# Wallet Ledger Safety Design

## Status

Design-only proposal. This document does not enable wallet APIs, accept deposits,
spend wallet funds, alter balances, issue refunds, or call Stripe/DT One. The
read-only diagnostics endpoint remains the only wallet-related runtime feature.
SMS/OTP work remains deferred until the final project phase.

## Current schema findings

The current schema has:

- `wallets.balance_cents` as a non-negative integer balance in EUR cents.
- One wallet per `(user_id, currency)`.
- `wallet_transactions` with amount, before/after balances, reference fields,
  description, and timestamp.
- A foreign key from wallets to users with `ON DELETE CASCADE`.
- A foreign key from wallet_transactions to wallets with `ON DELETE CASCADE`.
- No unique idempotency constraint on transaction references.

The cascade behavior is a financial-history risk: deleting a user can cascade
through the wallet and erase its transaction history. Before wallet activation,
retention and account-deletion behavior must be redesigned so financial records
are retained or anonymized under an approved retention policy rather than
silently deleted. Do not change the existing foreign keys until a reviewed
migration and retention policy are approved.

## Required design before any financial write API

### 1. Identity and authorization

- Bind every wallet to a stable authenticated customer identity on the server.
- Never accept a client-supplied `user_id` as authority.
- Derive the wallet owner from the verified session/token.
- Admin diagnostics and customer wallet access must use separate authorization
  paths and least-privilege checks.
- Do not depend on SMS/OTP implementation in this phase; account identity
  binding must be reviewed separately before enabling wallet access.

### 2. Ledger as the financial source of truth

- Treat the transaction ledger as append-only.
- Never edit or delete a posted financial transaction to correct it.
- Correct mistakes with a compensating transaction linked to the original.
- Store all EUR amounts as integer cents; never use floating-point money.
- Enforce valid transaction types, positive transaction amounts where
  appropriate, and mathematically consistent before/after balances.
- Wallet balance is a cached projection and must reconcile to the ledger.

### 3. Atomic posting and concurrency

Every posting must run in one database transaction:

1. Begin a transaction.
2. Lock the wallet row with `SELECT ... FOR UPDATE`.
3. Check the idempotency key and reject a conflicting reuse.
4. Verify sufficient funds for debits.
5. Insert exactly one immutable ledger entry.
6. Update the cached wallet balance from the locked prior balance.
7. Commit; roll back all steps on any error.

Never calculate a new balance from an unlocked read. Never allow a debit to
make the balance negative.

### 4. Idempotency and uniqueness

- Require a server-generated or server-validated idempotency key for each
  financial operation.
- Add a unique constraint for the operation identity only after diagnostics
  confirm there are no existing duplicates and the key semantics are finalized.
- Define whether uniqueness is scoped by wallet, provider, operation type, or
  reference before writing the migration.
- Repeated requests with the same key and same payload must return the original
  result; the same key with a different payload must fail safely.
- Provider webhooks must be independently idempotent and must not post twice.

### 5. Reconciliation and audit

- Reconcile wallet balance against the sum/sequence of posted ledger entries.
- Detect duplicate operation keys, negative balances, gaps, and inconsistent
  before/after chains.
- Record administrative actions in a separate audit trail with actor, action,
  reason, timestamp, and correlation ID.
- Never expose customer phone numbers, emails, or internal wallet IDs in
  aggregate diagnostics.
- A mismatch must block wallet operations and require investigation; do not
  auto-correct balances.

### 6. Deposits, purchases, refunds, and reversals

- Deposits require independently verified payment-provider state; a client
  success screen is not proof of payment.
- Wallet-funded top-ups must reserve/debit funds atomically and link the ledger
  entry to one immutable order reference.
- Failed fulfillment must follow an explicit compensating-credit workflow,
  with idempotency and review states.
- Refunds must never be inferred from a top-up failure alone. Stripe refund
  state and wallet reversal state must be tracked separately and reconciled.
- No real payment, refund, top-up, or product activation is authorized by this
  design document.

## Implementation gates

Do not enable wallet financial writes until all gates are complete:

1. Approved identity-binding model and account deletion/retention policy.
2. Reviewed ledger schema and migration with duplicate preflight checks.
3. Atomic posting service with row locking and idempotency.
4. Append-only protections and compensating-entry workflow.
5. Unit, concurrency, integration, and migration tests.
6. Reconciliation and admin audit coverage.
7. Explicit sandbox end-to-end verification.
8. Separate production approval after sandbox evidence is reviewed.

## Immediate next engineering step

Build a migration preflight that reports duplicate candidate references and
existing cascade constraints without changing data. Use its output to design
the final uniqueness and retention migration. Keep wallet APIs and all
financial writes disabled throughout that work.
