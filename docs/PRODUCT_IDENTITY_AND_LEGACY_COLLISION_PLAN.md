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


## Code audit follow-up (2026-11-11)

The source-level inventory has now confirmed these concrete legacy-key dependencies:

- `database.sql` declares both the provider-ID uniqueness (`product_catalog.product_id`) and the legacy natural-key uniqueness (`country, operator, amount, currency`).
- `migrate.js` contains three seed upserts targeting the legacy natural key (around lines 230, 259, and 304 in the audited branch revision). These must be converted deliberately; simply dropping the constraint would make those conflict targets invalid.
- `server.js` has an exact internal catalog-ID resolver that joins the active country registry and requires active, verified operator and product mappings before returning a customer-selectable product.
- The same resolver still contains a legacy operator-key/amount compatibility branch and a final older operator-label/amount fallback. The quote endpoint also accepts legacy operator/amount input. Checkout's validator accepts either exact product ID or legacy operator/amount identity. These compatibility paths are additional migration gates: they must be retired or explicitly bounded before same-denomination products can be safely exposed.
- The customer product-list endpoint returns the internal catalog ID as `productId` and the DT One provider ID separately as `providerProductId`; Flutter checkout sends the exact internal `productId`.

### Next implementation sequence

1. Add regression tests proving that customer checkout requires an exact catalog product identity and that a supplied identity cannot be silently replaced by an operator/amount match. Preserve a deliberate compatibility window only if it is explicitly needed for older installed app versions.
2. Update quote and checkout callers consistently, then update the Flutter request contract and tests.
3. Rework all three migration seed upserts around provider identity with a production-like upgrade test.
4. Only after these tests pass, prepare the additive product metadata migration and a separate constraint-removal migration.

This follow-up is an inventory and sequencing update only. No database constraint, product row, import, activation, checkout behavior, or production service has been changed.


## Exact-selection implementation update (2026-11-11)

The application request path has now been tightened on this PR branch:

- The quote endpoint requires an exact internal catalog \`productId\`; operator-label and amount-only quote requests are rejected.
- Checkout validation requires an exact internal catalog \`productId\`; operator-label, operator-key, and amount-only checkout requests are rejected.
- The backend resolver now resolves only \`product_catalog.id\` within the selected country and requires active, verified country, operator, and product mappings plus a positive wholesale EUR cost.
- Flutter sends the selected catalog \`productId\` for both quote and checkout; the checkout request no longer sends operator/amount fallback identity.
- Regression tests were updated to enforce this request contract.

**Important remaining limitation:** the existing database natural-key unique constraint on \`(country, operator, amount, currency)\` is still present, and three historical migration seeds plus admin preview/import still depend on it. Therefore this change removes ambiguous runtime fallback but does **not yet** permit two same-denomination provider products to coexist in the database. The separate schema/admin migration remains blocked until all three seed upserts, admin import logic, and production-like upgrade tests are updated. No products were imported or activated, and no production database was migrated.
