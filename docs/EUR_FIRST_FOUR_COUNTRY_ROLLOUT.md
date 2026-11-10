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

- All 1,960 rows contain wholesale EUR and retail EUR source fields; for ranged products these fields are min–max price ranges, not single fixed prices.
- 1,929 rows are fixed-value recharge products in the four local destination currencies.
- 14 fixed-value PIN/eSIM purchases use USD as the destination/product currency (4 Pakistan, 7 India, 3 Bangladesh); these are not AFN/PKR/INR/BDT recharge denominations and must be kept in a separate eSIM/USD product class.
- 17 products are ranged/open-range products (14 ranged-value recharge and 3 ranged-value payment); their destination amounts and EUR prices are expressed as ranges and must use ranged-pricing logic.
- The master catalog contains no duplicate Product IDs.
- **Critical database compatibility finding:** 186 source rows across 90 groups share the legacy database key (country + operator + destination amount + currency). These are legitimate separate provider products such as airtime, data bundles, and voice bundles that happen to have the same face amount. The existing live `product_catalog` has a unique constraint on that legacy key, so the current import route can silently skip products via `ON CONFLICT DO NOTHING`. The product model and customer selection path must be changed to use the exact DT One Product ID (and service/subservice metadata) before the full catalog can be imported safely. Do not remove the constraint until every query and checkout path has been migrated and tested.
- Country totals remain Afghanistan 542, Bangladesh 488, India 147, Pakistan 783; the 28 operator/service groups include the eSIM entries.
- Therefore the workbook does **not** have 17 missing wholesale/retail prices. It has 17 ranged prices. Earlier wording that described them as missing fixed prices was inaccurate and is superseded by this audit.

## EUR pricing rules

For each fixed-value product, preserve the provider's exact DT One product ID, operator, country, destination amount/currency, wholesale EUR, retail EUR, and source-file evidence. Convert EUR amounts to integer cents using decimal-safe rounding. Never derive wholesale cost from retail price or apply an FX rate to a price that is already supplied in EUR.

The supplied retail profit is a source field and must be reconciled as:
`retail_profit_eur = retail_price_eur - wholesale_price_eur`
within the source's cent precision.

The customer checkout quote is a separate calculation. It must add the configured PGNT application fee and gross up the Stripe processing fee in EUR; it must not silently reuse the DT One retail price as the final customer charge. Compare both values and explain the difference.

## Country readiness checklist

For each of AF, BD, IN, and PK:
- [ ] Resolve the 90 legacy key collision groups by migrating product identity/selection to exact DT One Product IDs before importing the full 1,960 rows.
- [ ] Import the 1,929 fixed-value local-currency recharge rows into a staging catalog with all products disabled.
- [ ] Keep the 14 USD eSIM/PIN products in a separate product class; do not treat USD as the country's local recharge currency.
- [ ] Keep the 17 ranged products in a separate ranged-pricing group, preserving their minimum/maximum destination and EUR price ranges.
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
country, operator, service, destination amount/currency, product type, and EUR
wholesale/retail prices. It preserves min–max ranges and permits USD only for
fixed eSIM PIN purchases. It checks the four local country/currency pairs,
positive values, duplicate provider IDs, supported fixed/ranged product types,
and retail-versus-wholesale range ordering. It reports, rather than silently
rejects or drops, the 90 legacy database-key collision groups (186 rows).

It deliberately returns every row with `providerVerified: false` and
`active: false`. A structurally valid row is **not** a provider-verified
product and is not eligible for production activation. The validator is
offline-only and does not connect to DT One, PostgreSQL, Stripe, or Render.

The uploaded master workbook audit found 1,960 rows: 1,929 fixed local-currency
recharge rows, 14 fixed USD eSIM/PIN rows, and 17 ranged rows (14 ranged
recharge plus 3 ranged payment). All rows contain EUR wholesale and retail
values, but ranged rows contain min–max ranges. The validator was run against all 1,960 workbook rows: all passed structural
validation, all remain inactive/unverified, and it identified 90 legacy key
collision groups involving 186 rows. The workbook is a staging source, not
current DT One price evidence.

## Current implementation boundary

The current backend still has an EUR-only customer checkout path. GBP/USD
checkout and international payment-method coverage are not enabled by this
catalogue validator. Do not describe the four-country catalogue as live or
fully price-verified until every product has fresh DT One detail/quote
evidence, the EUR pricing calculation is reconciled, and the full test suite
passes.
