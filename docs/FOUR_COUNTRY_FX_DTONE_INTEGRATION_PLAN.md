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

### PostgreSQL migration-order diagnostic results — 2026-11-08

The integration branch now runs both migration SQL fixtures against isolated PostgreSQL schemas. The diagnostic assertions verify that:

- Applying PR #196 then PR #204 leaves both root tables (`countries` and `country_registry`) populated, while the shared localization/operator tables remain foreign-keyed to `countries`.
- Applying PR #204 then PR #196 leaves both root tables populated, while those same shared child tables remain foreign-keyed to `country_registry`.
- The `country_operators` column contract also depends on order: the PR #196-first schema has no required `provider` column and permits a nullable `provider_operator_id`; the PR #204-first schema has a required `provider` column and non-null `provider_operator_id`.

The diagnostic suite passed in PostgreSQL CI, and the complete backend regression suite passed (259 tests, zero failures). These are **expected-finding tests**, not proof of compatibility: they deliberately confirm that migration order changes the resulting schema. The forward-only canonical reconciliation migration and tests for clean install / deployed-main upgrade remain outstanding. The two registry migration fixtures are test-only and are not applied to Render or any production database.


## CI update — 2026-11-08 (PR #225)

Latest integration head `e74aa691c9fe9d2009abc55b2650d348434dba44` has:
- Backend regression suite: 264 passed, 0 failed.
- Canonical registry reconciliation: 5 PostgreSQL integration cases passed, including PR #196 without `country_provider_settings`.
- Dependency security audit: passed.
- Android APK workflow: passed; artifact `pgnt-asian-topup-apk` was created for this exact head.

## Remaining end-to-end blockers (do not treat CI as production acceptance)

- Current `main` server does not expose `GET /api/countries/:countryCode/operators`; the dynamic Flutter loader therefore cannot use the registry against the deployed main backend yet.
- Current `main` `validateCheckoutInput`, quote route, and checkout product resolution do not accept/resolve the stable `operatorKey` contract. They still resolve legacy operator display name + amount or product ID.
- The PR #204 customer operators route returns legacy aliases (`code`, `name`, `providerName`) and does not return the full canonical public contract (`operator_key`, `provider_operator_id`, `display_name`). It must be adapted and provider IDs must remain server-trusted.
- The reconciliation SQL currently exists only as a test fixture. It is not a production migration and must not be wired into Render startup until reviewed against the actual deployed schema, migration ledger, all child constraints, duplicate identities, and a verified backup/restore rehearsal.
- Quote-only tests must prove stable operator-key resolution to a unique verified product for AF/PK/IN/BD. Checkout tests must prove the same mapping is re-resolved server-side inside the order transaction; client provider IDs must be ignored/rejected.
- No live country/operator/product activation, Stripe charge, DT One top-up, refund, production migration, or deploy is authorized by these CI results.

## Registry API implementation update
- Added a read-only `GET /api/countries/:countryCode/operators?language=en|ps|fa|ur|hi|bn` route on the integration branch.
- The route returns the canonical `operator_key`, `provider_operator_id`, and localized `display_name` contract expected by the Flutter registry parser.
- It exposes only active countries and active operators with a non-empty provider ID and a non-null verification timestamp. Provider IDs are returned as server-origin metadata; quote/checkout must still resolve them server-side.
- If the canonical registry tables are absent or incompatible, the route returns HTTP 503 rather than pretending the country has no operators or falling back to unverified mappings.
- Added source-contract tests for the response shape and fail-closed filters. CI for the latest integration commit is running.
- This is not yet a complete end-to-end integration: current main has no canonical registry migration, and quote/checkout still need server-side `operatorKey` resolution against verified operator-product mappings. Do not deploy this route or enable registry-driven customer selection until that migration and those paths are reviewed and tested together.

## Stable operator-key resolution implementation update
- The read-only operator list now filters out operators without at least one active, verified product mapping.
- Quote and checkout accept `operatorKey` as the preferred identity. When supplied, the backend resolves the operator through `country_registry` and `country_operators`, then resolves the exact denomination through `country_operator_products` joined to the existing `product_catalog`.
- The resolver requires an active country, active operator, non-empty server-side provider operator ID, operator verification timestamp, active product mapping, mapping verification timestamp, matching destination currency, and exact denomination. Client-supplied provider IDs are not read.
- Legacy display-name/product-ID requests remain available for deployed clients during the staged transition; they are not used when an `operatorKey` is supplied.
- Added migration 017 for an explicit operator-to-catalog mapping table. It is deferred until canonical registry tables exist, starts every mapping inactive/unverified, and intentionally does not guess or seed mappings from display names. Existing products remain unchanged.
- Added contract tests covering validation, quote/checkout resolution, verified mapping filters, and deferred migration behavior.
- Remaining before end-to-end use: canonical registry reconciliation must be implemented and tested on every supported historical schema; an admin-only workflow must create and verify explicit mapping rows; migration 017 must be tested against both registry schema variants; quote and checkout integration tests must exercise PostgreSQL data and ensure no ambiguity; all CI workflows must pass. No deployment or product activation is authorized by this PR.
- Follow-up schema alignment: the canonical reconciliation normalizes operator translations to `country_operator_localizations(operator_id, language_code)`; the API now joins translations by the stable database operator row ID, so it works with the clean canonical schema as well as migrated legacy rows.
- Keyed checkout validation now requires a valid denomination whenever `operatorKey` is supplied, even if a legacy product ID is also present. The stable-key resolver remains the authoritative path in that case.
## Ranged-value Airtime: mandatory two-step pricing and fulfillment design — 2026-11-08

Official DT One DVS documentation confirms that Mobile Airtime supports both FIXED_VALUE_RECHARGE and RANGED_VALUE_RECHARGE. Ranged products expose provider-defined destination.amount.min, max, and increment, plus accepted calculation modes. Their product-level wholesale price is itself a range, not one fixed EUR price. DT One explicitly recommends auto_confirm: false for ranged products so the integrator can inspect the transaction's actual wholesale price before confirmation.

### Consequences for the current PGNT flow

- The existing local catalog and order model assume one fixed denomination and one saved wholesale EUR-cent price per product.
- The current Stripe-paid fulfillment path submits a single-step transaction with auto_confirm: true and does not send a requested destination amount. That is valid only for fixed-value products.
- The current read-only discovery route can identify ranged product type and range bounds, but the current catalog import/sync path still expects a single numeric denomination and fixed EUR retail/wholesale amounts. It must not import a ranged product as if its minimum amount were a fixed product.
- Therefore, merely widening the Flutter input to 10–3000 or adding a server range check would be unsafe: the exact provider wholesale cost for a chosen amount has not yet been established.

### Required implementation before enabling customer ranged top-ups

1. Add explicit catalog capability fields for product type, amount mode, destination minimum, maximum, increment, accepted calculation modes, and required beneficiary fields. Preserve fixed-product behavior unchanged.
2. Import/sync ranged products as disabled capability records only. Validate RANGED_VALUE_RECHARGE, currency, country/operator identity, positive min/max/increment, and DESTINATION_AMOUNT support. Never convert the provider amount range into a fake fixed denomination.
3. For a customer amount, validate 10–3000 and the provider's exact min/max/increment. Then create a DT One transaction with auto_confirm: false, calculation_mode: DESTINATION_AMOUNT, and the requested destination currency and amount. Verify the returned transaction ID, external ID, product ID, requested destination amount, and wholesale price.
4. Calculate the EUR customer charge from the actual ranged transaction wholesale cost plus the configured PGNT fee and estimated Stripe fee. The provider wholesale amount may be denominated in a non-EUR source currency; use only a verified conversion/settlement policy, never the public reference FX rate as a substitute for DT One's actual charge.
5. Save the DT One CREATED transaction ID and immutable price evidence before presenting Stripe Checkout. If Stripe checkout creation fails or payment is cancelled, cancel the unconfirmed DT One transaction and reconcile its final state. Respect DT One's 60-minute confirmation expiry.
6. After Stripe's signed webhook independently confirms the exact saved EUR payment, confirm the already-created DT One transaction by provider transaction ID. Do not create a second transaction. On timeout or uncertain provider outcome, move the order to review and never blindly retry.
7. Persist requested amount, adjusted destination amount, actual wholesale amount/currency, applied conversion source/rate/timestamp, product type, provider transaction ID, and confirmation state for support/audit.
8. Add PostgreSQL integration tests and mocked provider contract tests for fixed products, ranged min/max/increment, amount out of range, unsupported calculation mode, mismatched provider IDs/amounts, wholesale price changes, Stripe cancel/failure, provider create/confirm timeout, duplicate webhook, expired confirmation, and idempotent reconciliation.
9. Keep the ranged capability hidden/inactive until all tests pass and the isolated DT One pre-production + Stripe test-mode lifecycle is verified. Production migration, activation, deployment, real payment, and live top-up require separate approval and backup/restore evidence.

### Customer-facing amount rule

The desired app input remains 10–3000 in the recipient's local currency, but that is a PGNT product policy ceiling/floor, not proof that every operator accepts every value. The selectable interval must be the intersection of PGNT's 10–3000 rule and the exact DT One product's verified min/max/increment. For fixed-value products, show only provider-confirmed denominations.
