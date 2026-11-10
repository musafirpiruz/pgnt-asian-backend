# Checkout pricing policy proposal — ATOMA Afghanistan 115 AFN

Status: **proposal only; not approved for production activation**.

## Scope

This note records the proposed customer checkout price for DT One product `7194` (ATOMA, Afghanistan, 115 AFN). It does not change runtime code, database values, product activation, country pricing activation, payment mode, or provider configuration.

## Observed values from the read-only diagnostic

| Field | Current recorded value |
| --- | ---: |
| DT One catalog retail price | EUR 2.10 |
| Verified DT One wholesale cost | EUR 1.89 |
| Afghanistan app fee | EUR 0.49 |
| Estimated Stripe fee | EUR 0.30 |
| Calculated checkout quote | EUR 2.68 |
| Difference: quote minus catalog retail | EUR 0.58 |

The quote calculation is consistent with the current fee policy: EUR 1.89 wholesale cost + EUR 0.49 app fee + approximately EUR 0.30 estimated Stripe fee = EUR 2.68 customer charge. Stripe's actual fee can vary by payment method and account.

## Proposed policy for review

1. Treat EUR 2.68 as a **proposed fee-inclusive checkout quote**, not as the DT One catalog retail price.
2. Continue storing and displaying provider catalog retail and wholesale prices as distinct values.
3. Explain the EUR 0.58 difference to administrators; do not silently overwrite either value to make them match.
4. Before activation, require an explicit business decision on whether the app's customer price is calculated from wholesale cost plus fees, or whether the provider retail price is intended to be the customer-facing price. Record that decision and test it.
5. Keep product `7194` disabled and Afghanistan pricing inactive until that decision, checkout tests, refund safety review, and production prerequisites are complete.

## Required verification before production

- Confirm the quote returned to the app and the amount submitted to Stripe are identical and server-calculated.
- Add or verify deterministic tests for rounding, Stripe percentage/fixed fee gross-up, invalid rates, missing wholesale cost, and currency handling.
- Verify the checkout readiness endpoint fails closed while the product or country pricing is inactive or required configuration is missing.
- Confirm no product activation, payment, refund, DT One fulfillment, or production pricing write occurs during policy review.
- Review actual Stripe pricing for the production account before treating the Stripe fee estimate as an exact cost.

## Explicit non-actions

This proposal does **not** authorize a live payment, real refund, DT One top-up, catalog product activation, pricing-setting activation, or change to production prices. No such action should be inferred from this document.
