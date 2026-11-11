# Automatic multi-currency pricing and admin-controlled referral rewards

Status: implementation specification and acceptance gates. This document does not change checkout, payment currencies, database rows, provider settings, or production services.

## Product decision

PGNT ASIAN TOPUP will calculate one all-inclusive customer total on the server. The customer sees one payable amount in the selected payment currency. The total must include the verified DT One wholesale cost converted into the selected payment currency, the configured app fee, and the Stripe processing fee gross-up. The mobile app must never calculate or submit an authoritative price.

General/legacy bonus is disabled. Referral reward is a separate reward ledger item, not a discount or a percentage added to every top-up. Referral rewards are configurable by the admin and become payable only after the referred customer's first successful qualifying payment, subject to server-side identity, idempotency, and anti-abuse checks.

## Currency rollout

Roll out sequentially, not all at once:

1. EUR first: preserve the existing production payment path and prove the new quote breakdown matches current checkout totals.
2. USD second: enable only after Stripe account/payment-method support, currency-specific fee rules, settlement implications, rounding, refunds, and reconciliation are tested.
3. GBP third: apply the same gates independently.

The destination/recipient currency (AFN, PKR, INR, BDT) is distinct from the customer's payment currency (EUR/USD/GBP). DT One wholesale price currency and timestamp/source must be explicit. Do not assume every DT One price is EUR without checking the authenticated response contract.

## Server-side price formula

For a selected payment currency:

- obtain a fresh, authenticated DT One wholesale price for the exact provider product ID;
- obtain a trusted FX quote from a configured provider, with source, timestamp, base/quote currencies, and validity window;
- convert wholesale cost into the selected payment currency using decimal-safe arithmetic;
- apply the admin-configured app fee (fixed amount and/or percentage, with clearly defined precedence and optional per-country/operator override);
- gross up the charge for the configured Stripe fee model so the estimated Stripe deduction does not reduce proceeds below wholesale cost plus app fee;
- round upward to the smallest supported minor unit;
- return a single total plus a transparent server-generated breakdown and quote expiry.

Formula concept: customer total = grossed-up( converted wholesale cost + app fee ). Stripe fee is included by gross-up, not added twice. The actual Stripe fee is reconciled from the completed charge/balance transaction; estimates are never represented as exact actual fees.

## Pricing rules and fail-closed behavior

- Store money as integer minor units and currency codes; use a decimal-safe library or integer/rational arithmetic for FX conversion. Never use binary floating point for authoritative money arithmetic.
- Keep currency-specific Stripe percentage/fixed fee settings; do not reuse EUR fee values for USD or GBP.
- Record FX source, rate, retrieval time, and quote expiry with the order/quote.
- Reject stale/missing FX, stale/missing wholesale price, unsupported currency, invalid fee settings, and provider product identity mismatch. Never fall back to a guessed, manually typed, or old retail price.
- A quote is bound to exact internal catalog ID, DT One provider product ID, country, recipient amount/currency, payment currency, fee-setting version, FX snapshot, and expiry.
- Revalidate quote identity and expiry before creating Stripe Checkout. Client-submitted totals are ignored.
- Customer UI displays one all-inclusive total. The detailed breakdown may be available in the receipt/expandable details; no surprise fees at final checkout.
- App fee is admin-controlled globally, with optional country/operator overrides only if their precedence is explicit and tested.
- Keep an immutable audit trail for settings changes and every quote calculation.

## Admin controls

- Enable/disable payment currencies independently (EUR, USD, GBP).
- Configure app fee per currency as fixed minor-unit amount and/or percentage, and optional country/operator overrides.
- Configure Stripe fee assumptions per currency and payment method/account profile; reconcile actual fees after payment.
- Configure FX source, maximum quote age, maximum permitted rate movement, and fail-closed behavior.
- View quote breakdown, margin/proceeds, FX age, provider wholesale price age, actual Stripe fees, and exceptions.
- Admin controls policy only; the system calculates every product price automatically.

## Referral reward (not a general bonus)

- Legacy bonus percentage must remain zero/disabled and must not affect product prices or top-up amounts.
- Referral rewards are a separate ledger liability, not a discount to the referred customer's checkout.
- Admin can create/disable codes and set a fixed reward amount and reward currency (EUR/USD/GBP) per code/campaign.
- If the reward currency differs from the payer's currency, preserve the configured reward currency; do not silently convert it. Any optional conversion must be explicit and auditable.
- Reward only after the referred account's first successful paid transaction and the configured fulfillment/eligibility condition. Define the condition before enabling automatic payouts.
- Use verified account identity and signed, expiring attribution; install ID alone is not proof of a unique person/device.
- Enforce database uniqueness/idempotency for one first-payment reward per referred account and one ledger posting per qualifying event. Prevent self-referrals and code reuse according to campaign policy.
- Keep reward pending until payment and eligibility are confirmed; reverse/hold according to documented refund/chargeback rules.
- Provide admin reporting and a complete immutable ledger. Never create a reward from a client-only event.

## Implementation phases

1. Audit existing EUR quote, Stripe Checkout, webhook, pricing settings, referral schema, and admin controls. Keep EUR behavior unchanged while tests are added.
2. Introduce versioned currency-aware quote/pricing domain functions and unit tests, with EUR-only runtime compatibility.
3. Add additive database migrations for currency-specific settings, FX snapshots, quote version/expiry, and referral reward currency/ledger fields. Do not run migrations automatically at startup or apply to production in this change.
4. Wire EUR quotes and Checkout to the shared server calculation; compare quote, Checkout Session amount, webhook amount, and ledger.
5. Add USD behind a disabled feature flag; sandbox and reconciliation tests first.
6. Add GBP behind a disabled feature flag; sandbox and reconciliation tests first.
7. Complete referral reward identity, idempotency, ledger, refund/chargeback, and admin controls separately from pricing.
8. Production rollout only after backup, migration preflight, rollback plan, full CI/security audit, sandbox evidence, and explicit owner approval.

## Acceptance criteria

- EUR customer total is one server-calculated amount, identical in quote and Stripe Checkout.
- Breakdown sums exactly to the total using integer minor units and documents the gross-up.
- General bonus is zero and absent from the top-up pricing calculation.
- Referral reward is not deducted from customer price and is credited only once after a qualifying first successful payment.
- USD and GBP remain unavailable until each has independent fee/FX/Stripe/refund/reconciliation test evidence.
- Missing/stale DT One or FX data blocks quote/checkout; no guessed fallback.
- Customer-visible products still require exact catalog product ID and verified DT One mappings.
- No production database migration, catalog activation, currency enablement, or live payment operation is performed as part of this specification.


## First implementation slice (2026-11-11)

Added an isolated server-side pricing domain module, `pricing-engine.js`, with unit tests. It uses integer minor units and a fixed-scale FX rate, calculates converted wholesale cost, fixed/percentage app fee, and Stripe fee gross-up into one all-inclusive customer total. It supports EUR/USD/GBP as payment currencies in the pure calculation layer, returns an explicit zero general bonus, and fails closed for unsupported currencies or invalid FX/fee inputs.

This module is deliberately not yet wired into live quote/checkout routes. The current production route contract remains EUR-only, and existing DB settings still contain legacy bonus fields. Before wiring, the team must implement currency-specific settings and trusted FX snapshots, validate Stripe fee profiles for each currency/payment method, and test quote-to-Checkout/webhook reconciliation. USD/GBP are not enabled by this commit. No DB migration, production setting, checkout, catalog activation, or live service was changed.
