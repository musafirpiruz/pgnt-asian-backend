# DT One product detail adapter

The existing backend's read-only catalog routes use these DT One detail fields:

- `id`
- `operator.name`
- `operator.country.iso_code`
- `destination.amount` and `destination.unit`, with the existing `benefits[0].amount.base/unit` fallback
- `prices.wholesale.amount` and `prices.retail.amount`

`dtone-product-detail-adapter.js` maps those fields into the normalized reconciliation shape and verifies that the returned product ID exactly matches the requested workbook ID. Provider country codes must be mapped explicitly (for example, the caller supplies `{ AFG: 'AF' }`); no country mapping is guessed.

Service, subservice, and product type are copied only when a recognized response field is present. Missing values remain blank and therefore cannot create a false `MATCHED` result. The actual detail schema for those classification fields still needs confirmation against DT One's account/API documentation before a full 1,960-product reconciliation is enabled.

This adapter is pure and offline. It does not make HTTP requests, write to PostgreSQL, create transactions, charge Stripe, or activate products.
