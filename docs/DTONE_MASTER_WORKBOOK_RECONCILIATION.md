# Official DT One master workbook reconciliation

## Safety boundary

The user-confirmed official workbook is the expected catalog baseline. This reconciliation core compares that baseline with normalized per-product DT One detail responses. It does not discover arbitrary provider products, make API calls, write PostgreSQL, create orders, charge Stripe, create DT One transactions, or activate products.

## Input contract

Workbook rows may use the literal exported column names or normalized camelCase keys. Provider detail responses must be mapped by a separate DT One adapter into the normalized fields accepted by `compareWorkbookProduct`. Do not infer a missing provider field from the workbook.

The comparison checks product ID, ISO country code, operator, service, subservice, product type, destination currency/amount, and wholesale/retail EUR prices. Numeric values and ascending ranges (for example, `30 - 4000` and `0.50 - 66.33`) are normalized before comparison; EUR price ranges compare endpoint-by-endpoint at cent precision. Fixed PIN/eSIM products may legitimately have a USD destination currency while their provider wholesale and retail prices remain EUR; destination currency is compared exactly as supplied, never inferred from the country. Blank workbook subservice remains blank and must match a blank provider subservice.

## Outcomes

- `MATCHED`: every compared field agrees; candidate only, not approval.
- `MISMATCH`: one or more compared fields differ or provider fields are absent/invalid.
- `MISSING_AT_PROVIDER`: workbook product ID was not returned by the per-ID provider lookup.
- `PROVIDER_DUPLICATE_ID`: provider returned the same product ID more than once.

Provider-only products are reported but never imported because the workbook Product ID list is the allowlist. `safeToImport` is deliberately always false; a later admin-only workflow must independently require review and explicit confirmation, and insert all products inactive.

## Authenticated live reconciliation runner

The admin-only runner is available at `/admin-dtone-master-reconciliation`.

1. Upload the official XLSX workbook and explicitly confirm the read-only run.
2. The server validates the `All_Products` sheet, required headers, exact 1,960 rows, unique Product IDs, the four country totals, and the supported product types.
3. The workbook rows are written only to the isolated `dtone_master_reconciliation_runs` and `dtone_master_reconciliation_items` staging tables. They are not inserted into `product_catalog` and are not eligible for checkout.
4. A background worker calls only `GET /v1/products/{id}` for Product IDs in the uploaded workbook. It requires an explicitly configured HTTPS `DTONE_API_BASE_URL` on a `*.dtone.com` host (the code's default pre-production fallback is deliberately rejected), records the exact API origin in the run, and uses a PostgreSQL advisory lock to serialize requests across app instances with at least one second between provider requests.
5. HTTP 404 is reported as `MISSING_AT_PROVIDER`. Field differences are `MISMATCH`; exact matches are `MATCHED`; provider/network failures are `LOOKUP_ERROR`. HTTP 429 pauses the run and observes `Retry-After`; resuming always requires a separate admin confirmation.
6. Each run stores the workbook SHA-256, source filename, report version, per-product expected/provider values, differences, and lookup outcomes. Download the JSON report for review.

The runner does not scan the entire provider catalog for IDs absent from the workbook; it checks only the 1,960 workbook IDs. Provider-only discovery, if required later, must be a separately reviewed read-only pass.

## Safety boundary for this runner

- The staging tables are reconciliation evidence only; they are not customer catalog tables.
- No SQL statement in the runner inserts, updates, deletes, or activates `product_catalog` rows.
- No Stripe API, DT One transaction endpoint, payment, refund, order, or top-up path is called.
- `safeToImport` remains false. No import or activation endpoint is exposed by this feature.
- All four DT One country mappings must already exist and be unambiguous. Missing mappings pause/reject the run instead of guessing.

## Remaining before live verification

1. Run the complete backend test suite and dependency security audit on the updated PR head.
2. Review the new migration and confirm the four provider-country mappings and DT One credentials in the deployment environment.
3. Do not merge or deploy until the PR review and CI are successful.
4. After a separately approved merge/deploy, an admin can upload the official workbook and start the read-only run. Review all 1,960 outcomes before considering any later catalog-import proposal.
5. Keep all products disabled. No sandbox order or payment is part of catalog reconciliation.
