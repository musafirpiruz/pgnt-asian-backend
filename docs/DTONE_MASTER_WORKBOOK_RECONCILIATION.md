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

## Required follow-up before integration

1. Implement and test an authenticated DT One detail adapter for all 1,960 workbook IDs, including ranged, PIN/eSIM, DTH and postpaid variants.
2. Parse the actual workbook upload on the server with strict header and row-count checks.
3. Persist a versioned staging report, not directly to `product_catalog`.
4. Review every mismatch, lookup failure, duplicate and provider-only ID.
5. Add a separately reviewed explicit import action that only accepts matched workbook IDs and keeps every row inactive.
6. Run migrations and production deployment only after CI and review. No sandbox order or payment is part of catalog reconciliation.
