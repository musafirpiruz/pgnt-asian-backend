# Future country onboarding (registry-driven)

PGNT ASIAN TOPUP must support adding a destination country through configuration and provider verification, without a code deployment for each country. This document describes the staged onboarding contract. It does not authorize adding or activating a country.

## Current API foundation

- `GET /api/countries?language=en` is read-only and returns only rows whose `country_registry.status = 'active'`.
- `GET /api/countries/:countryCode/operators?language=en` returns only verified, active operators that have at least one verified, active product mapping.
- `GET /api/admin/countries` requires the admin API key and lists registry entries.
- `POST /api/admin/countries` requires the admin API key and creates a `draft` country with localized display names. It does not set DT One provider IDs, FX rates, operators, products, or activation flags.

## Required onboarding stages

1. **Draft country metadata** — ISO alpha-2 code, English/localized names, destination ISO currency, calling code, and national phone digit bounds. Validate uniqueness and metadata before saving.
2. **FX configuration** — store a positive local-currency-per-EUR rate with source, observation timestamp, and freshness policy. EUR remains the customer payment currency.
3. **Provider country verification** — resolve and persist the exact DT One country identifier from an authoritative provider response. Never derive it from the ISO code.
4. **Operator discovery** — import provider operator IDs and names from DT One. Keep operators inactive until exact provider IDs and country association are verified.
5. **Product discovery** — import exact DT One product IDs, product type, currency, denominations or ranged-value constraints, and wholesale price evidence. Never synthesize product IDs or infer denominations.
6. **Pricing review** — calculate retail EUR pricing from verified wholesale cost, configured app fee, Stripe fee, and current FX evidence. A missing or stale rate or wholesale cost blocks activation.
7. **Sandbox verification** — run controlled pre-production checks and verify provider status/callback reconciliation. No live customer fulfillment during onboarding.
8. **Activation approval** — require an authorized admin action after all checks pass. Only then set country/operator/product records active and verified.
9. **Customer app discovery** — Flutter fetches active countries and operators from the APIs; no hardcoded country list or hardcoded denomination fallback.
10. **Audit and rollback** — record who changed configuration, previous/new values, provider evidence, and activation timestamps. Deactivation must hide the country without deleting financial or transaction history.

## Fail-closed rules

- Draft, configuring, testing, legacy, or disabled countries never appear in customer discovery.
- Missing provider IDs, FX evidence, wholesale price, phone metadata, or verified catalog mapping block activation.
- Customer checkout currency remains EUR.
- Provider status and product availability are authoritative; the app must not invent network denominations.
- Never overwrite an existing country/currency mapping silently. Conflicts require manual reconciliation.

## Remaining implementation work

- Replace the remaining hardcoded country/currency/phone maps in backend validation and Admin UI with registry-backed lookups.
- Add audited admin workflows for FX evidence, provider country/operator mapping, catalog import/verification, and activation/deactivation.
- Remove the four-country CHECK constraint from operator pricing through a reviewed forward-only migration.
- Update Flutter country and operator discovery to consume the APIs and handle loading, unavailable, and empty states.
- Add integration tests for unauthorized admin access, draft creation, duplicate country code, localization validation, hidden draft countries, and activation gates.
- Review and safely wire the current-schema registry bootstrap migration only after backup/restore rehearsal and migration-order reconciliation.

## Scope of this work

No new destination country is being added now. The goal is to make future onboarding configuration-driven and safe. The current APIs are groundwork, not a claim that end-to-end onboarding is complete.
