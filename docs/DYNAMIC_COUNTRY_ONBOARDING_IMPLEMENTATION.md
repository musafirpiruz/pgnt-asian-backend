# Dynamic Country Onboarding — Implementation Notes

This implementation is developed in PR #204 and is not production-enabled until the PR checks, review, and deployment verification pass.

## Workflow

1. Create a country as `draft`.
2. Discover DT One countries using the read-only provider country endpoint.
3. Discover the country’s ISO 4217 currency candidates from country metadata; explicitly confirm the destination currency (never guess when multiple currencies are returned).\n4. Verify an explicit ISO alpha-2 to DT One alpha-3 mapping against the provider response.
5. Discover and verify the complete provider product list and every product detail.
6. Refresh settlement and destination currency rates from Frankfurter v2. The rate is stored with source, observed date, and a five-day expiry. A failed refresh preserves the prior saved quote; an expired quote is not used for new pricing.
7. Preview catalog candidates. Product denomination currency must match the configured destination currency. Wholesale and retail price currency units must both be present and match. A non-EUR settlement currency is converted using a fresh EUR-base rate. Ambiguous/duplicate catalog entries are excluded for review.
8. Import only after explicit admin confirmation. Imported products and operators remain disabled.
9. Configure pricing, translations, and manually review operators/products.
10. Run preflight. Country activation requires a verified provider mapping, phone rules, an active operator, an active verified product, active pricing, fresh destination FX, all six app languages, and valid EUR price calculations.
11. Activate explicitly. Disabling a country removes it from the runtime allowlist and blocks new orders while retaining records.

## Admin page

Open `/admin-countries` on the backend. The page does not embed an admin key; the administrator enters it in the browser session. The key is sent only in the `x-admin-api-key` header for admin API requests.

## Main endpoints

- `GET /api/admin/dtone/countries`
- `GET /api/admin/countries`
- `POST /api/admin/countries`\n- `POST /api/admin/countries/:countryCode/currency-discovery` (discover candidate ISO 4217 currencies)\n- `PUT /api/admin/countries/:countryCode/destination-currency` (explicit admin confirmation)
- `POST /api/admin/countries/:countryCode/dtone-mapping`
- `POST /api/admin/countries/:countryCode/dtone-catalog/sync`
- `POST /api/admin/fx/rates/refresh`
- `PUT /api/admin/countries/:countryCode/pricing`
- `PUT /api/admin/countries/:countryCode/localizations`
- `PUT /api/admin/countries/:countryCode/operators/:operatorId/localizations`
- `GET /api/admin/countries/:countryCode/operators`
- `GET /api/admin/countries/:countryCode/products`
- `GET /api/admin/operator-pricing?country=XX`
- `PUT /api/admin/operator-pricing/:country/:operator`
- `PATCH /api/admin/countries/:countryCode/operators/:operatorId`
- `PATCH /api/admin/countries/:countryCode/products/:productId`
- `POST /api/admin/countries/:countryCode/validate`
- `POST /api/admin/countries/:countryCode/activate`
- `POST /api/admin/countries/:countryCode/disable`
- `GET /api/countries/active`
- `GET /api/countries/:countryCode/operators`
- `GET /api/countries/:countryCode/products`

## Database migrations

- 017: country registry, provider mappings, operators, prefixes, products, FX observations, sync runs, activation checks and audit.
- 018: global EUR-base settlement-currency FX rates and immutable history.
- 019: per-country pricing settings, inactive by default.
- 020: per-operator localized names for all six app languages.
- 021: remove the legacy four-country restriction from operator-specific fee settings.\n- 022: persist country currency discovery candidates, source and observation time, with explicit administrator confirmation.

The existing AF/PK/IN/BD catalog and pricing data are not rewritten by these migrations. The four existing destinations remain in the legacy path until separately verified and migrated.

## Safety boundaries

- New countries are not customer-visible before explicit activation.
- Products are never enabled during import.
- A provider price without a verifiable currency unit is rejected.
- A stale or missing FX quote blocks conversion and activation.
- No Stripe charge, real DT One transaction, refund, or production deployment is part of this onboarding workflow.
- Dynamic countries are loaded into the backend runtime allowlist only after activation.
