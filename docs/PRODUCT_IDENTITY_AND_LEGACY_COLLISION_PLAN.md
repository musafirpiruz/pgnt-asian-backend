# Product identity and legacy catalog collision plan

Status: design and acceptance checklist only. This document does not alter the database, import catalog rows, activate products, or change checkout behavior.

## Verified current constraints

- `product_catalog.product_id` is unique and represents the DT One provider product ID.
- `product_catalog` also has a legacy unique key on `(country, operator, amount, currency)`.
- The supplied master catalog audit found 90 legacy-key collision groups involving 186 rows. These are separate provider products that share a country/operator/face amount/currency; they must not be silently collapsed.
- The admin catalog preview currently classifies a second provider product with the same operator and denomination as a conflict and excludes it from the import candidate list.
- The bulk import uses `ON CONFLICT DO NOTHING` defensively and rolls back if any candidate was not inserted.
- The customer product-list and quote/checkout path now support exact internal catalog product identity, with server-side verified country/operator/product mappings required for customer-visible products.
- The old operator/denomination resolver remains as a compatibility path. It must not be used to select among products that share a denomination.

## Required target model

1. Keep DT One `product_id` unique and use it as the provider identity. Keep the internal `product_catalog.id` as the stable application identity.
2. Store provider distinctions needed by the customer and support teams: product name, service, subservice, product type, and a bounded provider-detail snapshot with retrieval timestamp/source.
3. Preserve the exact country, operator, destination amount/range, destination currency, wholesale EUR price, retail EUR price, and provider product ID.
4. Keep all newly staged/imported rows disabled and unverified until the existing explicit verification workflow records provider evidence and an authorized activation.
5. Change customer selection and quote/checkout to use the exact internal catalog ID end-to-end. Do not infer a product from amount alone.
6. Retain the legacy natural key only until every remaining query, admin route, migration seed, and operational report has been checked. Then replace it with non-unique lookup indexes; do not delete or merge any of the existing rows.

## Migration and rollout gates

- [ ] Inventory every SQL statement, index, migration seed, admin endpoint, report, and customer resolver that depends on the legacy natural key.
- [ ] Add nullable provider metadata columns first; backfill only from authenticated DT One detail responses, not from denomination guesses or the workbook alone.
- [ ] Add integration tests with two distinct provider IDs sharing the same country/operator/amount/currency. Both must be stored and returned as separate disabled products.
- [ ] Add a test proving exact product selection returns the intended provider ID and never falls back to the other product with the same denomination.
- [ ] Update all migration seed upserts to target the unique provider product ID, while preserving historical price/activation safety behavior.
- [ ] Update admin preview/import to classify by provider ID, not by denomination. Same-denomination products with distinct IDs must be separate candidates, not conflicts.
- [ ] Before dropping the legacy unique constraint, prove no production code or migration still uses it as an upsert target. Replace it with ordinary indexes for country/operator/amount/currency browsing.
- [ ] Test upgrade from a production-like copy containing existing catalog rows and country/operator/product mappings. Verify row counts, foreign keys, and mapping references before and after.
- [ ] Keep imports disabled; compare all 1,960 staged rows against current authenticated DT One detail/price evidence before any activation.
- [ ] Run sandbox quote, checkout, fulfillment, callback, refund, and reconciliation tests for each product class before enabling any customer-facing product.

## Explicit exclusions

- Do not auto-select or merge duplicate-denomination products.
- Do not manufacture service/subservice labels or provider IDs.
- Do not use workbook prices as proof of current DT One prices.
- Do not remove the legacy unique constraint in the same change that introduces metadata without first testing all legacy query paths.
- Do not apply the migration to production or activate products as part of this design task.
