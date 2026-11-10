# Global Customer Access, Payment Methods, and Multi-Currency Wallet

## Product requirements

PGNT ASIAN TOPUP must be usable by customers internationally. The customer's physical/payment country is independent from the recipient's top-up destination country. Device locale may suggest a default only; it must not lock the customer to a country or be treated as proof of residence, billing country, or Google Play download country.

## Payment method selection

The checkout experience must offer eligible methods dynamically according to the customer's billing/payment country, currency, provider account configuration, and the payment processor's current eligibility rules. Do not promise that every method is available in every country.

Target payment methods:
- Visa and Mastercard (including eligible cards issued in the United States, United Kingdom, European countries, and other supported markets).
- Google Pay where supported by the processor, device/browser, card issuer, and merchant configuration.
- PayPal through a separately approved and integrated PayPal payment flow; it is not automatically provided by Stripe card checkout.

The UI must show only methods actually enabled and eligible for that transaction. It must provide a clear fallback when a method is unavailable or declined. Never store raw card numbers, CVCs, or wallet credentials; use provider-hosted/tokenized payment components.

## Payment currency versus destination currency

- Destination currency belongs to the recipient country and provider product (for example AFN for an Afghanistan top-up).
- Payment currency belongs to the customer's selected/eligible checkout context.
- Initial payment currency targets: EUR, GBP, USD.
- Suggested default: EUR for eligible euro-area customers, GBP for eligible UK customers, USD for eligible US customers. This is a suggestion, not a hard country lock; the final options must follow processor eligibility and explicit customer choice.
- Show the total, currency, app fee, FX conversion basis, and any permitted charge before the customer confirms.
- Use integer minor units and server-side authoritative pricing. Do not trust client-calculated amounts.
- Actual processor fees must be reconciled from provider settlement/balance transaction data; estimates are not final accounting.
- Do not add prohibited card surcharges. Any cost recovery/pricing must be reviewed for applicable law and processor rules.

## Multi-currency wallet

The wallet must support separate balances by currency, initially EUR, GBP, and USD. Never combine unlike currencies into one numeric balance.

Required ledger behavior:
- Append-only, auditable double-entry ledger (or an equivalently rigorous balanced ledger) with immutable transaction references.
- Separate available, pending, and reserved amounts per currency.
- Credit only after verified payment settlement/authorization policy; never trust a client callback.
- Debit/reserve atomically when an order is accepted; release or refund safely on failed/cancelled top-ups.
- Idempotency keys and unique provider/payment references to prevent duplicate credits, debits, refunds, and rewards.
- Record FX conversions as linked debit/credit entries with source amount, destination amount, rate, fee, timestamp, and rate source; require customer confirmation before conversion.
- Full transaction history, receipts, reconciliation, admin audit trail, and dispute/refund linkage.
- No negative available balance; enforce concurrency-safe database transactions and row locking/serializable safeguards as appropriate.
- Admin adjustments require authorization, reason, actor identity, and audit record. No silent balance edits.

## Security, compliance, and rollout

- Server-side authorization and ownership checks for every wallet operation.
- Never expose provider secrets or payment credentials to the app.
- Apply applicable sanctions, AML/KYC, consumer-protection, tax, and payment-provider restrictions. Global app access does not mean every country or transaction is legally or operationally eligible.
- Keep unverified destination countries/products unavailable, regardless of the customer's location.
- Payment method integration, wallet ledger, FX conversion, and refunds require separate automated tests, reconciliation tests, security review, and explicit production approval.
- This requirements document does not activate PayPal, Google Pay, additional card acquiring, wallet deposits, or live multi-currency checkout. Those integrations must be implemented and verified in separate reviewed changes.
