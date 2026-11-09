# DT One four-country CSV audit — 2026-11-10

## Scope and safety
This report records a read-only validation of the four CSV exports supplied for PGNT ASIAN TOPUP. It does not import products, create operator mappings, enable products, modify pricing settings, run migrations, charge customers, create DT One orders, or deploy services.

## Source coverage

| Country | Operator in CSV | Currency | Rows | Fixed rows | Ranged rows |
|---|---|---:|---:|---:|---:|
| Afghanistan | ATOMA Afghanistan | AFN | 119 | 118 | 1 |
| Pakistan | Jazz Pakistan | PKR | 197 | 196 | 1 |
| India | Airtel India | INR | 39 | 39 | 0 |
| Bangladesh | Airtel Bangladesh | BDT | 103 | 102 | 1 |
| **Total** | **4 operators** | | **458** | **455** | **3** |

## Validation findings
- All 458 rows have a product ID, product name, country, operator, destination currency, and product type.
- Product IDs are unique across the four files (0 duplicates).
- All 455 fixed-value rows have positive wholesale EUR and retail EUR prices; no fixed row has retail below wholesale.
- All 455 fixed-value rows have a numeric destination amount.
- 13 fixed-value rows have decimal destination amounts (Afghanistan). Preserve the decimal amounts; do not coerce them to integers.
- 29 fixed-value rows fall outside the previously requested 10–3000 local-amount range: Afghanistan 4, India 4, Pakistan 21, Bangladesh 0. They must be reviewed against the product-availability policy rather than silently altered.
- The 3 ranged products (Afghanistan product 11899, Pakistan product 11322, Bangladesh product 11744) have no destination min/max amount and no wholesale/retail EUR price in these CSV exports. They cannot be priced or activated from these files alone.

## Rate interpretation
The CSV columns `WHOLESALE RATE` and `RETAIL RATE` vary by product row. They are product-level local-currency-per-EUR ratios derived from each product's local denomination and EUR price, not a single authoritative foreign-exchange feed. Do not average them into a country FX setting or replace the FX provider's reference rate with them.

Observed row-level ranges:
- AF: wholesale 58.8235–60.3094; retail 52.6316–54.3478
- PK: wholesale 222.2222–237.0240; retail 200.0000–213.3216
- IN: wholesale 81.4815–84.4043; retail 71.4286–75.9603
- BD: wholesale 100.0000–103.6392; retail 86.9565–93.2753

## Pricing requirements to implement and verify
- Checkout currency remains EUR.
- PGNT application fee is fixed at EUR 0.49 (49 cents) per eligible top-up.
- Stripe fee is calculated server-side from the configured Stripe pricing parameters, not entered by customers and not hard-coded as a universal amount. Persist the estimate in the quote and reconcile it to the actual Stripe balance-transaction fee after payment.
- Customer price must be derived from the DT One wholesale EUR price + EUR 0.49 application fee + grossed-up estimated Stripe fee. The CSV retail price is source metadata and must not silently override this calculation.
- Referral rewards remain separate from the removed general bonus.
- Product activation requires live DT One product/operator identity verification and successful quote-only acceptance for the relevant country/operator/product.

## Next gates
1. Obtain provider-confirmed min/max and price calculation semantics for the 3 ranged products.
2. Review the 29 fixed products outside 10–3000 and the 13 decimal AFN denominations against the intended customer amount policy and DT One acceptance.
3. Reconcile the CSV-derived product-level rates with the separate reference FX feed and the currently stored country pricing settings.
4. Complete operator identity wiring and database migration/restore rehearsal before any catalog import.
5. Run quote-only checks for representative products in all four countries, then sandbox checkout/refund tests.
6. Keep all products disabled until those gates pass.

## Safety state
No database write, migration, product import, product activation, payment, refund, top-up, or production deployment was performed by this audit.
