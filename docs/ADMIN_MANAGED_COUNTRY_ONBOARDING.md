# Implementation status (2026-11-02)

The database foundation is being introduced on branch `feat/database-driven-country-registry` in migration 017:

- Adds normalized `countries`, `country_localizations`, `country_operators`, `operator_prefixes`, `country_exchange_rates`, and `country_provider_settings` tables.
- Seeds AF, PK, IN, and BD as active DT One destinations using conflict-safe inserts.
- New country rows default to `draft`; FX observations are marked reference-only by default.
- The migration does not rewrite existing pricing, product catalog, orders, refunds, or wallet data.
- Migration regression tests are in `tests/country-registry-migration.test.js`.

**Implemented on this branch (pending full CI and staging verification):** public active-country and active-operator read APIs; protected admin APIs to create draft countries and inactive operator/provider mappings; Flutter fetches the active country directory and operator directory, retains the verified legacy operator list as a fallback for the four existing countries, validates phone length using returned country metadata, and refreshes localized directory data when the app language changes. New country/operator records remain non-sellable until their provider/product mappings and activation preflight are completed.

**Still not complete:** admin country creation/configuration APIs and UI, DT One operator mapping/import workflow, provider/FX scheduled refresh, price history and guarded price application, and end-to-end staging tests. Do not treat the country registry migration alone as enabling new countries or automatic live repricing.

---

# Admin-Managed Country Onboarding

## Goal

Adding a destination country must be a configuration workflow, not a code rewrite. An administrator should be able to draft a country, configure its providers/operators/products/pricing/translations, validate it in a safe test mode, and only then enable it for customers.

**Important:** a country must never become sellable merely because its name was added. Provider coverage, product mapping, verified costs, currency conversion, pricing, number validation, and test results must all pass first.

## Intended admin workflow

1. **Create country (Draft):** ISO 3166-1 alpha-2 code, English/local names, flag, destination currency, supported languages, phone calling code and number rules.
2. **Configure provider:** select DT One or another supported provider; store provider credentials only in server-side environment/secret storage; map provider country/network identifiers.
3. **Configure operators:** display names and translations, provider/operator IDs, active state, and phone-prefix rules. Prefix matching must be country-specific and support manual operator selection if the prefix is ambiguous.
4. **Import and review products:** import provider catalog into a disabled state; review denomination, provider product ID, destination currency, wholesale cost, availability, and duplicate mappings.
5. **Set pricing:** configure exchange-rate source/value, fixed fee/percentage, Stripe fee assumptions, minimum/maximum amount, rounding rules, and final customer price in EUR. Customers see the final total only. Never silently alter live pricing when an exchange rate changes.
6. **Translate labels:** require customer-facing country/operator/product/status strings in Pashto, Dari, English, Urdu, Hindi, and Bengali, or explicitly use a documented fallback before activation.
7. **Run preflight checks:** provider connectivity, country/network mapping, product mapping, verified wholesale cost, exchange-rate freshness, positive margin/fee calculation, number validation, localization completeness, and payment/fulfillment environment compatibility.
8. **Sandbox test:** quote a sample order and test provider success/failure callbacks without a real charge or live top-up.
9. **Enable explicitly:** only an authorized admin can enable the country after every required check passes. Keep a change log and provide a one-click disable/rollback.
10. **Monitor:** track quote failures, provider declines, stale rates, price mismatches, and unsupported prefixes per country.

## Data model direction

Use database-backed, normalized configuration rather than country lists duplicated across Dart and Node code:

- `countries`: code, localized names, flag, destination currency, calling code/validation metadata, provider, status (`draft`, `testing`, `active`, `disabled`), created/updated audit fields.
- `country_localizations`: country code, language code, display name, fallback metadata.
- `country_operators`: country code, stable operator key, localized labels, provider operator ID, active status.
- `operator_prefixes`: country code, operator key, prefix, priority, validation metadata; detect ambiguous matches and require manual choice.
- `country_products`: country code, operator key, denomination, destination currency, provider product ID, wholesale cost, catalog status, last verified timestamp.
- `country_pricing_settings`: country code, fee settings, rate policy/source, rounding policy, limits, version and audit history.
- `country_activation_checks`: country/version, check name, result, timestamp, safe diagnostic details.
- Keep customer EUR as the payment currency unless a deliberate product-level change is approved. Store money in integer euro cents and use decimal-safe arithmetic for rates/costs.

All country/operator/product relationships should use foreign keys and stable codes. Avoid hard-coded constraints such as `CHECK (country IN ('AF','PK','IN','BD'))` where a foreign key to the countries table is appropriate.

## Admin UX requirements

- A guided **Add country** wizard with Draft → Configure → Validate → Sandbox test → Activate.
- Clear green/yellow/red status per check, with a plain-language reason and fix instructions.
- Bulk import/export (CSV/JSON) with schema validation and a preview before saving.
- Duplicate country/operator/product detection.
- Audit log for who changed rates, fees, mappings, product status, or activation.
- Safe rollback to the previous configuration version.
- No secrets in exports, logs, Flutter code, or Git.
- Customer app obtains the list of active countries/operators/products from a versioned backend API. It must not show draft/disabled countries.

## Acceptance tests before this is considered complete

- A new draft country can be created without editing the country list in Dart or Node source.
- Draft/disabled countries never appear in the customer app and cannot receive quotes or orders.
- An incomplete or unverified product cannot be activated.
- Ambiguous phone prefixes do not silently select the wrong operator.
- Prices use the selected country's destination currency and verified cost while customer checkout displays the final EUR total.
- Missing translations, stale exchange rates, missing provider IDs, and failed sandbox checks block activation with actionable messages.
- Disabling a country prevents new orders while preserving existing order/history records.
- Existing Afghanistan, Pakistan, India, and Bangladesh configuration remains unchanged until migrated and verified.
- Migration and tests are idempotent; no live price, product, payment, or refund changes are performed as part of onboarding code changes.

## Implementation sequence

1. Audit current hard-coded country constraints and all country/operator/product lookup paths.
2. Introduce the database country registry and idempotent migration while preserving existing four countries.
3. Make backend APIs read active country configuration from the registry and validate all inputs against it.
4. Build the admin wizard, catalog import/review, pricing preview, preflight checks, audit log, and activation controls.
5. Change Flutter to consume the active-country API; keep the selected-country picker compact and translations complete.
6. Add test fixtures for a disabled sample country and prove it cannot quote/order before activation.
7. Run backend tests/security audit and Android analysis/build; merge only after review and successful checks.

This document defines the target architecture. It is not a claim that the admin wizard or database-driven country registry already exists.
