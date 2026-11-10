# PGNT ASIAN TOPUP — Pricing Verification Register

Status: audit baseline only. No live prices, FX rates, fees, product activations, or payment settings were changed.

## Objective

Verify every customer-facing amount from authoritative provider cost through destination FX, payment-currency conversion, application fee, payment processing cost, rounding, and final customer charge. A price is not approved merely because a unit test passes.

## Currency dimensions that must remain separate

1. DT One wholesale/source currency and source amount.
2. Recipient destination amount and destination currency (AFN, PKR, INR, BDT initially).
3. PGNT internal accounting currency and application fee.
4. Customer payment currency (target EUR, GBP, USD).
5. Stripe settlement currency and actual processing fee.

Never add amounts expressed in different currencies. Every conversion must record source amount/currency, destination amount/currency, rate, source, timestamp, expiry, and rounding rule.

## Existing implementation findings

- The main `server.js` checkout path currently normalizes customer payment currency to EUR only. GBP/USD are not active checkout paths.
- `payment-currency.js` defines target application fees: EUR 49 minor units, GBP 59, USD 59. These are application fees, not Stripe fees.
- `multi-currency-pricing.js` gross-up accepts one wholesale amount and all fee inputs in the same currency. It does not convert EUR wholesale costs into GBP/USD.
- Existing tests prove arithmetic for supplied inputs only. The GBP/USD test uses a hard-coded wholesale amount of 250 in the target currency; it does not prove a real EUR-to-GBP/USD conversion or a real Stripe fee.
- `fx-observation.js` selects an approved, fresh EUR-to-destination reference observation, but it does not fetch rates, write pricing, or activate countries.
- `dtone-fx.js` accepts only DT One products whose source currency is EUR. If the real DT One product/wallet source currency is USD or another currency, this helper correctly rejects it; do not bypass that guard.
- The main pricing path reads `local_currency_per_eur` with `afn_per_eur` fallback, while legacy schema/settings also include older AFN-specific naming. Schema compatibility and the authoritative FX column need to be reconciled before enabling pricing writes.
- Product retail catalogue price and the calculated customer quote are separate values. Any mismatch is a blocker until explained and approved.
- Existing main checkout uses Stripe fee settings as estimates; actual fees must be reconciled from Stripe balance transactions for each payment method/market.

## Initial customer application fee targets (not yet activated)

| Customer payment currency | Target app fee | Status |
|---|---:|---|
| EUR | €0.49 | Defined in policy module; current main checkout is EUR-only |
| GBP | £0.59 | Defined in policy module; checkout not implemented |
| USD | $0.59 | Defined in policy module; checkout not implemented |

Do not translate these fees into one another using a guessed FX rate. Confirm whether the commercial fee policy is intended to remain fixed by currency.

## Country pricing verification matrix

For each verified DT One operator/product, collect and approve:
- country, operator, DT One product ID and exact provider product type;
- destination amount/currency and phone constraints;
- provider source amount/currency and wholesale amount/currency;
- provider FX rate and exact field meaning (source units to destination units);
- provider quote timestamp, source reference, expiry/freshness;
- EUR reference FX source/rate/timestamp/expiry where needed;
- customer payment currency and conversion path;
- application fee, estimated payment fee configuration, and actual settled fee evidence;
- final customer price, rounding, expected net revenue, and margin;
- sandbox order result and reconciliation evidence.

Initial country/currency pairs: AF/AFN, PK/PKR, IN/INR, BD/BDT. No rate is considered verified from old screenshots, stale settings, or a manually typed number.

## Approval rules

- Fail closed if wholesale cost, source currency, destination currency, fresh FX, or pricing configuration is missing or inconsistent.
- A reference FX rate is not automatically the DT One wholesale rate. Store the sources separately and define which one is authoritative for each pricing calculation.
- Use integer minor units for customer payments and a documented decimal precision/rounding policy for provider destination amounts.
- Test boundary values, rounding, refunds, partial failures, duplicate webhook events, and currency mismatches.
- Verify real Stripe fee schedule for the merchant account and payment method; do not treat a generic percentage as universal.
- No production pricing write, product activation, migration execution, checkout enablement, or live payment until the full matrix is evidenced and approved.

## Test plan / completion gates

1. Read-only export of all current pricing settings and catalog products with wholesale costs.
2. Compare every catalog wholesale cost against fresh DT One product details/quotes and confirm source currency.
3. Verify FX independently for EUR/AFN, EUR/PKR, EUR/INR, EUR/BDT; include source and freshness.
4. Reconcile the schema and current pricing code's FX column names.
5. Build a per-product quote matrix for EUR, then separately model GBP/USD only after currency conversion and payment-method fee inputs are verified.
6. Compare calculated quote to catalog retail price and explain every difference.
7. Run automated unit, integration, sandbox, and accounting reconciliation tests.
8. Obtain explicit approval before any production write or enabling a new payment currency/method.

## Current conclusion

Pricing is not yet fully proven. The present code has an EUR-only live checkout path, a separate multi-currency calculation foundation, and FX selection helpers that are not yet an end-to-end authoritative pricing pipeline. No current exchange rate or final customer price should be declared approved until the evidence matrix above is completed.
