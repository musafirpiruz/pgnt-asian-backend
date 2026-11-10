# EUR-first rollout — four-country catalog

Status: implementation planning and source-file audit only. This document does not activate products, change prices, apply migrations, or enable customer checkout.

## Agreed rollout order

1. Complete and validate the EUR customer-payment path for all four recipient countries in the supplied DT One catalog.
2. Only after EUR has passed end-to-end tests and reconciliation, implement USD as a separate customer-payment currency.
3. Only after USD has passed, implement GBP as a separate customer-payment currency.

Recipient/destination currencies remain independent of customer payment currency:
- Afghanistan: AFN
- Pakistan: PKR
- India: INR
- Bangladesh: BDT

## Today's supplied master catalog audit (10 November 2026)

Source: `PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES.xlsx`, sheet `All_Products`.

| Country | Product rows | Distinct operators/services |
|---|---:|---:|
| Afghanistan | 542 | 5 |
| Bangladesh | 488 | 6 |
| India | 147 | 9 |
| Pakistan | 783 | 8 |
| **Total** | **1,960** | **28** |

- 1,943 rows have both wholesale EUR and retail EUR values.
- 17 rows are ranged/open-range products with no fixed wholesale or retail EUR amount. These must use the separate ranged-pricing path and must not be imported as fixed prices.
- The master catalog contains no duplicate Product IDs.
- Product types in the source: 1,929 fixed-value recharge, 14 fixed-value PIN/eSIM purchases, 14 ranged-value recharge, and 3 ranged-value payment products.
- The 17 ranged products are not a reason to block fixed-value products; they are a separate validation group.

## EUR pricing rules

For each fixed-value product, preserve the provider's exact DT One product ID, operator, country, destination amount/currency, wholesale EUR, retail EUR, and source-file evidence. Convert EUR amounts to integer cents using decimal-safe rounding. Never derive wholesale cost from retail price or apply an FX rate to a price that is already supplied in EUR.

The supplied retail profit is a source field and must be reconciled as:
`retail_profit_eur = retail_price_eur - wholesale_price_eur`
within the source's cent precision.

The customer checkout quote is a separate calculation. It must add the configured PGNT application fee and gross up the Stripe processing fee in EUR; it must not silently reuse the DT One retail price as the final customer charge. Compare both values and explain the difference.

## Country readiness checklist

For each of AF, BD, IN, and PK:
- [ ] Import the 1,943 fixed-value product rows into a staging catalog with all products disabled.
- [ ] Keep the 17 ranged products outside the fixed-value import and validate them through ranged-pricing logic.
- [ ] Confirm every product ID and product detail against current authenticated DT One read-only product details.
- [ ] Confirm provider source currency is EUR and destination currency matches the country/product.
- [ ] Validate wholesale EUR, retail EUR, provider fee, destination amount, and phone requirements.
- [ ] Reconcile each country FX observation separately; do not treat the DT One wholesale product rate and a public/reference FX rate as interchangeable.
- [ ] Calculate EUR customer quote using the approved EUR fee policy and Stripe account/payment-method fee evidence.
- [ ] Run sandbox checkout and fulfillment/reconciliation tests per operator/product type.
- [ ] Only after review and explicit approval, enable products and EUR checkout.

## Payment-currency sequence

### Phase 1 — EUR (current priority)
EUR is the only customer payment currency currently accepted by the main checkout path. Finish the four-country catalog and price reconciliation in EUR first.

### Phase 2 — USD (not enabled)
Implement a real EUR-wholesale-to-USD charge conversion, source/timestamp/expiry tracking, USD-specific rounding, Stripe payment-method eligibility and actual fee reconciliation. The existing USD application fee policy is not proof that USD checkout works.

### Phase 3 — GBP (not enabled)
Implement the equivalent EUR-wholesale-to-GBP conversion and GBP-specific Stripe eligibility/fee reconciliation only after USD passes. The existing GBP application fee policy is not proof that GBP checkout works.

## Safety gates

- No live product activation or customer-facing price publication while wholesale/source-currency/provider evidence is missing or stale.
- No database migration or production price write until the import has been reviewed against current DT One product details and a rollback/export plan exists.
- No USD or GBP checkout until its currency conversion and Stripe settlement/fee path is implemented and tested end to end.
- This rollout is for the four countries in today's supplied catalog; future countries require a country registry entry, DT One operator/product discovery, FX and phone validation, then the same EUR-first gates.


## Offline catalogue staging validator

The branch now includes `catalog-staging-validator.js` and
`tests/catalog-staging-validator.test.js`.

The validator accepts normalized JSON rows with the DT One product ID,
country, operator, destination amount/currency, product type, and EUR
wholesale/retail prices. It checks the four supported country/currency pairs,
positive amounts and prices, duplicate provider IDs, duplicate destination
keys, supported fixed/ranged product types, and retail-versus-wholesale order.

It deliberately returns every row with `providerVerified: false` and
`active: false`. A structurally valid row is **not** a provider-verified
product and is not eligible for production activation. The validator is
offline-only and does not connect to DT One, PostgreSQL, Stripe, or Render.

The uploaded master workbook audit found 1,960 rows: 1,943 fixed-price rows
and 17 ranged/open-range rows. The 17 ranged rows must be handled by the
separate ranged-value flow and must not be assigned invented fixed prices.
The workbook is a staging source, not current DT One price evidence.

## Current implementation boundary

The current backend still has an EUR-only customer checkout path. GBP/USD
checkout and international payment-method coverage are not enabled by this
catalogue validator. Do not describe the four-country catalogue as live or
fully price-verified until every product has fresh DT One detail/quote
evidence, the EUR pricing calculation is reconciled, and the full test suite
passes.
