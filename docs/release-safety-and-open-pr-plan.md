# PGNT ASIAN TOPUP — release safety and open PR plan

Status date: 2026-10-31

This document records the current repository release gates and the safe order for completing the remaining work. It is a planning and verification artifact only; it does not change runtime behavior, database contents, pricing, product activation, or provider settings.

## Verified repository baseline

- Default branch: `main`.
- Baseline commit when this document was prepared: `1b7c0176cd61babe7a51d5f67406ab1f894fa08e`.
- The Firebase phone-auth final-phase runbook is present in Main from PR #185.
- The runbook is documentation only. Firebase client SDK integration, backend ID-token verification, and OTP delivery are not yet enabled by this document.
- The successful Android release workflow previously recorded for commit `0dca0655e713136589a7107fedf46ce0498a189e` produced an APK of 24,806,905 bytes. This is build evidence, not Play Store approval or proof of live payment readiness.

## Open pull requests and disposition

| PR | Scope | Current disposition | Required next action |
|---|---|---|---|
| #95 | EUR/USD/GBP payment currency settings plus Afghanistan catalog/pricing changes | Do not merge as currently composed | Retarget/rebase onto current Main; split currency schema/API from catalog import; preserve all existing pricing and catalog values; prove migration behavior on populated DB |
| #84 | Influencer campaigns and legacy referral retirement | Do not merge/activate yet | Replace client install-hash identity with verified Firebase UID and server-signed attribution token; add replay, race, idempotency, refund and payout-evidence tests |
| #139 | ATOMA 115 AFN checkout pricing policy proposal | Draft proposal only | Business decision required on wholesale-cost-plus-fees vs provider retail; verify current DT One price and Stripe fees before any activation |

## Safe implementation order

### 1. Currency settings — schema/API preparation only

- Keep EUR as the only active checkout currency.
- Keep USD and GBP disabled.
- Do not refresh or overwrite existing country FX/pricing settings automatically.
- Do not alter existing product catalog identifiers, retail/wholesale prices, activation flags, or timestamps.
- Separate reference FX metadata from provider wholesale pricing. A public reference rate must never substitute for a DT One product wholesale price.
- Add tests proving existing populated rows remain byte-for-byte/value-for-value unchanged after migrations.

### 2. Firebase Authentication — final-phase implementation

- Use Firebase Authentication only for phone identity/OTP; do not add Twilio or another paid SMS provider.
- Verify Firebase ID tokens on the backend using the official Firebase Admin SDK.
- Derive identity only from the verified token UID.
- Keep OTP sending disabled until Firebase project/app configuration and emulator tests are complete and the owner explicitly approves enabling SMS.
- Never commit service-account credentials or API secrets. Configure secrets directly in the provider dashboard.

### 3. Referral/influencer security

- Reward is fixed at EUR 0.07, set and enforced by the backend.
- Reward only after the referred user’s first genuinely paid, completed top-up.
- One attribution and one reward per verified Firebase UID.
- Use a short-lived server-signed attribution token bound to UID and campaign.
- Enforce database uniqueness, transaction locking, idempotency and duplicate-webhook protection.
- A paid reward requires an external payout reference plus immutable audit/ledger evidence.
- Keep campaigns inactive and payouts disabled until all tests and a separately approved payout process are complete.

### 4. Wallet

- Keep wallet APIs read-only/preflight only.
- Keep schema changes, financial writes, ledger posting and wallet activation disabled.
- Before activation, require transaction atomicity, row locks, idempotency, reconciliation, audit evidence, duplicate-reference prevention, concurrency tests and retention approval.

### 5. Stripe, refunds and DT One

- Use isolated sandbox/pre-production tests only.
- Confirm server quote equals Stripe Checkout amount and test rounding/fee gross-up deterministically.
- Verify failed/unknown DT One outcomes and authenticated callbacks without blind retries.
- A declined top-up is not evidence that a Stripe refund was issued.
- Never activate catalog products or perform live payments, refunds, or top-ups as part of these checks.

### 6. Release and deployment

- Re-run backend tests, security audit, Flutter analyze and release APK verification on the final Main commit.
- Verify Render health and deployment separately; CI success is not production health evidence.
- Complete Play Store signing, privacy/data-safety declarations, app listing and release checks before public release.

## Explicitly prohibited without separate owner approval

- Production database migrations or data writes.
- Live FX/pricing changes or catalog activation.
- Wallet financial writes or payouts.
- Real Stripe payments or refunds.
- DT One live fulfillment.
- OTP/SMS activation or sending.
- Production deployment/configuration changes.

## Evidence required before calling the app production-ready

1. Current Main SHA and passing CI results.
2. Read-only authenticated production health/preflight outputs, with secrets and personal data removed.
3. Firebase emulator and backend token-verification tests.
4. Stripe sandbox checkout/webhook/refund test evidence.
5. DT One pre-production product/quote/callback/final-status evidence for each enabled product.
6. Wallet safety review and explicit approval if wallet writes are ever enabled.
7. Signed release artifact and Play Store compliance checklist.

A feature is not considered complete merely because its code or documentation exists. It must have passing tests and the required environment-specific evidence.
