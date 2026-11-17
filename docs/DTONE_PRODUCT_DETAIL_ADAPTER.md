# DT One product detail adapter

The adapter follows the official DT One DVS product-detail schema:

- `id`
- `operator.name` and `operator.country.iso_code`
- `service.name` and nested `service.subservice.name`
- `type` for the product type
- `destination.amount` and `destination.unit`; ranged amounts may be objects with `min`, `max`, and `increment`
- `prices.wholesale.amount/unit` and `prices.retail.amount/unit`; ranged price amounts may be `{ min, max }` objects
- the existing benefits fallback uses `benefits[0].amount.base` with `benefits[0].unit`

The provider country code must be mapped explicitly (for example, the caller supplies `{ AFG: 'AF' }`); no country mapping is guessed.

The workbook's wholesale and retail price columns are EUR. Therefore the adapter exposes each provider price currency separately and the reconciliation core requires both to be EUR before a product can match. A USD (or other currency) provider price is a mismatch, not a value to convert silently.

Service and subservice come from the nested `service` object; product type comes from `type`. Missing values remain blank and therefore cannot create a false `MATCHED` result. Destination amounts and provider prices may be fixed numeric values, ascending strings, or DT One `{ min, max }` objects; the adapter converts object ranges to endpoint strings without losing the bounds. The API may return a null retail price for a ranged product; that remains missing and is reported as a mismatch rather than inferred. Do not force PIN/eSIM destination currency to the operator country's local currency: compare the provider's actual destination unit, while wholesale and retail price units must independently be EUR.

This adapter is pure. It does not make HTTP requests, write to PostgreSQL, create transactions, charge Stripe, or activate products.

Official references:
- DT One product detail example and field structure: https://developers.dtone.com/docs/best-practices-for-filtering-and-categorizing-products
- DT One service/subservice definitions: https://developers.dtone.com/reference/services-and-subservices
- Product discovery is paginated and supports country, service, subservice and product-type filters: https://developers.dtone.com/reference/getproducts
