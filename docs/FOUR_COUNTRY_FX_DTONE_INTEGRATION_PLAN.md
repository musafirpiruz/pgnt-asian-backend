# Four-country FX and DT One integration plan

Status: integration preparation only. This branch is not production-enabled.

## Scope
Preserve the existing Flutter and Node.js application. Complete Afghanistan (AFN), Pakistan (PKR), India (INR), and Bangladesh (BDT) using one server-authoritative pricing pipeline.

## Existing implementation to preserve
- PR #224: pricing quote error classification and legacy AFN rate compatibility (already merged).
- PR #203: automatic reference FX refresh for AFN/PKR/INR/BDT, 24-hour cadence, source timestamps, freshness validation, atomic updates, history, and preserve-last-good behavior.
- PR #196–#200: country registry, localization repair, checkout country/operator/denomination guards, provider operator identifiers, and explicit country/operator/product mapping.
- PR #204: dynamic country onboarding, currency discovery, admin workflow, and production acceptance runbook.

## Integration findings
- PR #196–#200 form a stacked chain: #196 targets main; #197 targets #196's branch; #198 targets #197's branch; #199 targets #198's branch; #200 targets #199's branch. Their recorded CI runs passed, but #196 has an outstanding focused review describing incomplete end-to-end operator registry wiring, discarded provider operator IDs in Flutter, incomplete locale translations, and missing verified backup/restore gate.
- PR #203 adds a legacy four-country FX refresh path writing pricing_settings.local_currency_per_eur and fx_rate_history.
- PR #204 adds generic provider-currency FX storage and dynamic-country FX refresh behavior. These models must be reconciled to a single authoritative FX source and explicit conversion direction/semantics before both refresh paths can be enabled.
- Migration version strings are distinct; the earlier claim of a direct duplicate migration-key collision was incorrect. Do not renumber migrations on that basis.

## Required implementation sequence
1. Reconcile PR #196–#200 as a stack, close the focused review gaps, and retain provider operator IDs from API through Flutter selection, quote, checkout, and fulfillment.
2. Reconcile FX data models: define reference recipient-currency rates vs provider settlement currency rates; choose one authoritative freshness/provenance policy; ensure pricing_settings and dynamic-country pricing consume the correct validated rate without duplicate schedulers or conflicting writes.
3. Keep Stripe checkout currency EUR. Use verified DT One wholesale product cost, configured PGNT fixed/percentage fee, and configured Stripe percentage/fixed fee to compute server-side customer EUR price. Do not treat public FX reference rates as DT One settlement guarantees.
4. Verify product currency and wholesale EUR cost before a catalog product can be activated. No inferred currency, guessed rates, or retail-price substitution.
5. Run clean database install and upgrade migration tests, rollback/restore rehearsal on isolated staging, backend syntax, full regression, security audit, and APK build.
6. Perform quote-only acceptance for representative products in all four countries. Only then proceed to DT One sandbox order and Stripe test-mode checkout/refund tests.
7. Production activation, real charges/refunds, live top-ups, SMS OTP activation, and deployment require separate explicit approval and verified backup/restore evidence.

## Current safety status
- No production database or pricing data changed by this plan.
- No products activated.
- No payment, refund, or top-up executed.
- No deployment initiated.


## Verified source-level blockers (reviewed against current main and PR patches)

### Operator identity contract is currently incompatible end-to-end
- PR #196's public operator endpoint returns rows with `operator_key`, `provider_operator_id`, and `display_name`.
- PR #204's Flutter dynamic-catalog parser currently reads `name` and `providerName` from operator rows. Those keys do not match the PR #196 response contract, so the registry operator list would be parsed as empty unless the API or parser is aligned.
- PR #204's Flutter `MobileOperator` addition retains only `providerName`; it does not retain `operator_key` or `provider_operator_id`.
- Current main's quote request sends only `country`, `operator`, and `amount`; current checkout sends display `operator`, amount, currency, and product ID, but neither `operatorKey` nor `providerOperatorId`.
- PR #200's quote and checkout lookup path relies on a verified `operatorKey` to require an explicit active `country_operator_products` mapping. Therefore Flutter must preserve the stable operator key and send it on both quote and checkout; provider IDs must be checked against the server-side registry, not trusted from the client.
- The current main checkout path therefore cannot safely consume PR #200's explicit operator/product mapping until the Flutter/API contract is completed.

### Required contract before integration
- Operator list response: `{ operators: [{ operator_key, provider_operator_id, display_name }] }` (optionally include localized display metadata, but preserve these stable fields).
- Flutter model: retain `operatorKey` and `providerOperatorId` separately from localized/display name; never identify an operator by translated name.
- Quote: send `country`, `operatorKey`, and `amount`; server resolves provider operator ID and product mapping from its database. A display-name field may be included for compatibility/diagnostics only.
- Checkout: send `country`, `operatorKey`, `amount`, and the server-issued quote/product reference; server re-resolves and validates the active mapping and price. Do not accept a client-supplied provider ID as authority.
- Add integration tests that exercise the exact API JSON shape through Flutter parsing, quote lookup, and checkout validation, including localized names and duplicate display names.

### Current quote/checkout regression risk
The currently deployed main branch Flutter code uses the legacy display-name lookup and does not send stable operator identity. Keep the new registry mapping path inactive until the aligned Flutter client and backend are built and tested together. Do not infer that a successful legacy quote proves registry identity validation is working.

## Pricing configuration discrepancy requiring read-only reconciliation

A recent Android quote screenshot showed an AFN/EUR reference rate of 72.9927 and an app fee of EUR 0.59. Earlier reviewed configuration notes recorded AFN/EUR 60.1000 and an app fee of EUR 0.49. The screenshot's quote displayed a EUR 1.89 DT One wholesale/base cost and a EUR 2.78 customer total.

These observations are not sufficient to conclude which values are currently authoritative: the screenshot may reflect a different settings version, fallback, cache, or pricing path. Before any pricing change or product activation:
- Read the effective persisted pricing settings and the quote calculation source in the same environment.
- Trace the exact fee components (PGNT fee, Stripe percentage/fixed fee, and any other configured charge) and confirm they are applied once.
- Confirm whether the AFN/EUR value is informational denomination conversion only; it must not replace verified DT One wholesale EUR cost.
- Compare the server quote response with the Android display for the same product and timestamp.
- Record the verified result and obtain explicit approval before changing production pricing.

No production setting was changed as part of this reconciliation note.

## Latest integration branch update — registry loader groundwork is present, activation remains gated

- The current PR #225 head `f7451b3d07ccf88b65f313caf233dfe2902af8dd` includes the Flutter `MobileOperator.fromRegistryJson` parser and a dynamic loader that requests `/api/countries/:countryCode/operators` with the selected language.
- The parser keeps `operator_key` and `provider_operator_id` separate from localized display labels. The loader accepts only entries with a non-empty stable operator key and retains the curated list as a fallback when the registry endpoint is unavailable.
- Quote and checkout requests forward `operatorKey` when a registry-backed operator is selected. The Flutter client does not send `providerOperatorId`; the backend must resolve provider identity from its own trusted registry.
- The loader is not yet active end-to-end against deployed main: main does not currently expose the registry operator route, and the required backend schema/quote/checkout contract has not been integrated.
- The source-contract tests and successful CI validate source shape and buildability; they do not prove PostgreSQL migration compatibility, live registry API behavior, quote correctness, or checkout fulfillment.
- Keep the curated operator list as fallback and do not treat the registry path as production-ready until the backend contract, canonical migration, PostgreSQL integration tests, and sandbox acceptance tests pass.


## Newly verified blocking schema incompatibility — PR #196 vs PR #204

A direct comparison of the migration SQL in the current PR heads confirms that the registry models are not additive-compatible merely because their migration version strings differ:

- PR #196 creates `countries(code)`, then creates `country_localizations.country_code -> countries(code)` and `country_operators.country_code -> countries(code)`. Its operator identity is unique on `(country_code, operator_key)` and stores nullable `provider_operator_id`.
- PR #204 instead creates `country_registry(country_code)`, then creates `country_localizations.country_code -> country_registry(country_code)` and `country_operators.country_code -> country_registry(country_code)`. Its operator rows require `provider` and `provider_operator_id`, with uniqueness on `(country_code, provider, provider_operator_id)` and `(country_code, operator_key)`.
- Both migrations use `CREATE TABLE IF NOT EXISTS` for the same table names `country_localizations` and `country_operators`. If either migration runs first, the other migration silently skips creating the second table definition; it does not add the missing columns, change the foreign-key parent, or reconcile constraints. Later queries from the other implementation can therefore fail or operate against the wrong registry parent.
- This is a real schema incompatibility, distinct from migration-key collisions. The migration version strings `017_database_country_registry` and `017_dynamic_country_registry` are different, but that does not make the shared table definitions compatible.

### Required resolution before either registry migration is combined

1. Choose one canonical country parent and registry schema for the application. Do not keep two competing country registries as parallel authorities.
2. Write an explicit forward-only reconciliation migration that inspects existing tables, columns, constraints, foreign keys, and data before altering anything. It must support both possible installation orders and preserve existing country/operator/localization rows.
3. Map PR #196's `countries` records and PR #204's `country_registry` records into the chosen canonical model with conflict detection; abort rather than guess when country codes, provider mappings, or operator identities disagree.
4. Add PostgreSQL integration tests for both migration orders (196 then 204, and 204 then 196), clean installation, and upgrade from the deployed main schema. Assert FK targets, required columns, uniqueness constraints, and row preservation—not just that migration scripts exit successfully.
5. Keep all registry migrations and dynamic endpoints inactive until the reconciliation tests pass. No production migration or deploy is authorized by this document.

Evidence reviewed from the migration files at the current PR heads on 2026-11-08. This finding supersedes any earlier assumption that distinct migration version strings alone made the registry migrations safe to combine.
