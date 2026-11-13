# Database migration rollout audit

Status: read-only source audit on 2026-11-13. No database connection, migration execution, schema write, or production change was performed.

## Finding

`package.json` starts the service with `node migrate.js && node server.js`. The current `migrate.js` runner records and executes the legacy migrations through `018_dtone_ranged_value_foundation`. A source scan found no references in that runner to migration files `023_current_catalog_country_registry_bootstrap.sql` through `029_country_sandbox_evidence.sql`.

These SQL files exist in `migrations/`, but their presence in the repository does not mean they have been applied. The GitHub Actions workflow runs `node migrate.js` against an isolated PostgreSQL service and separately executes selected proposal SQL files in test steps; this is not proof that the later migrations are installed in the Render production database.

## Migration inventory and dependency notes

| Version | Purpose | Main dependency / risk | Current rollout status |
|---|---|---|---|
| 023 | Canonical country/operator/product registry bootstrap | Requires existing catalog and country/operator data reconciliation; defaults mappings inactive | SQL file only; runner does not execute it |
| 024 | Country-local FX rates | Requires authoritative rate source, freshness and currency semantics | SQL file only; runner does not execute it |
| 025 | Multi-currency wallet ledger foundation | Financial ledger; must prove balanced journals, immutability, idempotency and safe coexistence with existing wallet data | Proposal only; isolated integration SQL exists |
| 026 | Provider product metadata | Additive catalog schema; provider detail must come from authenticated DT One responses | Proposal only; isolated integration SQL exists |
| 027 | Product identity uniqueness | Drops legacy country/operator/amount/currency unique constraint; requires product_id uniqueness and all seed/import/query paths reviewed | Proposal only; isolated integration SQL exists |
| 028 | Fixed/ranged order identity | Makes orders.product_id nullable and adds fulfillment identity constraints/FK; requires complete runtime support and backfill validation | Proposal only; no production rollout |
| 029 | Country sandbox evidence | Depends on country_registry from 023; review columns and preflight require this table | Proposal only; route/test changes exist in PR #241 |

## Safe next implementation sequence

1. Do not add 023–029 to automatic startup yet. First establish a tested, ordered migration plan and explicit per-version preconditions.
2. Add isolated PostgreSQL integration coverage for 023 and 024, including both fresh-install and upgrade-from-current-schema paths.
3. Review 025 as a financial subsystem independently; prove per-currency balanced posting, transaction immutability, reversal semantics, concurrency and idempotency. Do not enable wallet funding or migrate balances as part of schema rollout.
4. Run 026 and 027 against production-like catalog snapshots. Confirm every historical seed, admin import, report, and resolver uses provider product identity before removing the legacy denomination uniqueness.
5. Do not apply 028 until all fixed/ranged order creation, fulfillment, callbacks, refunds, admin views, and reporting explicitly support the new discriminator. Preserve existing fixed orders.
6. Apply 029 only after 023 has created and reconciled country_registry. Keep all evidence pending until independently reviewed; the migration itself must not activate any country, operator, or product.
7. For every migration: take and verify a restorable backup, capture preflight row counts and constraints, run in a disposable clone, verify postconditions, prepare a tested rollback/recovery plan, and obtain explicit deployment approval.
8. Only then decide whether each reviewed migration should be registered in the startup runner or executed through a separately controlled release migration job. Never silently mark a file as applied.

## Verification boundaries

- Successful unit tests and isolated PostgreSQL tests do not prove production schema state.
- No authenticated DT One product/price evidence was obtained by this source audit.
- No current FX rate, customer price, country activation, live checkout, refund, wallet movement, or product import is approved by this document.
- EUR remains the only live checkout currency in the current backend path. GBP/USD remain future work and require real currency conversion and payment-fee verification.


## Follow-up findings from the 2026-11-13 migration-order review

### 023/024 test coverage

The branch contains an isolated PostgreSQL script, `tests/country-registry-fx-023-024.integration.sql`, that applies 023 then 024 twice and checks four country rows, 24 localizations, inactive operator/product mappings, no imported FX observations, idempotency, and country/currency FK enforcement. The separate 024 integration test also checks that legacy `pricing_settings` values are not rewritten and that FX observations default to unapproved.

This is useful isolated-schema evidence, but it does not prove that 023 is safe against the current Render database. In particular, 023 intentionally aborts if **any** `product_catalog` row is active, and it requires positive `pricing_settings.local_currency_per_eur` for all four countries. Those exact production preconditions must be measured on a restorable clone before any rollout.

### Canonical registry migration-order conflict

The existing `tests/country-registry-migration-order.integration.test.js` is explicitly diagnostic: it demonstrates that two older registry migration fixtures can create competing root tables (`countries` and `country_registry`), while shared child tables bind their foreign keys to whichever root was created first. The test currently asserts that this conflict remains observable; it is not a passing reconciliation of the two roots.

Therefore, do not treat the presence of `country_registry` after 023 as sufficient proof of a canonical schema. Before production rollout, reconcile the legacy `countries` root and the newer `country_registry` root, prove which existing routes and foreign keys use each, and add an upgrade test that guarantees one canonical parent with no orphaned or duplicated country/operator data.

### Startup and version-number policy

The startup runner currently executes through the 018 ranged-value foundation. The repository's migrations directory contains 023–029, with no 019–022 SQL files in this branch. The numbering gap alone does not establish that migrations are missing or safe to invent. Do not create placeholder versions or silently mark them applied. Keep 023/024 as separately reviewed rollout candidates until the competing-registry issue and production preconditions are resolved. Keep 025–029 out of startup as required by `tests/country-migration-rollout-safety.test.js`.

### Updated decision

- **Do not change `migrate.js` yet.** Wiring 023/024 into automatic startup could expose every deployment to the active-catalog guard and to the unresolved dual-root registry history.
- First add a disposable upgrade fixture representing the actual current schema, including both legacy and canonical registry objects and their foreign keys.
- Then reconcile the canonical registry with explicit data-preservation assertions, validate 023/024 on that fixture, and only afterward design a controlled release migration step.
- 025 remains a financial-ledger proposal; 026/027 remain catalog-identity proposals; 028 remains blocked on complete ranged-order runtime support; 029 remains dependent on a reconciled canonical registry and independent evidence review.

No database was connected, no migration was executed, no production data was modified, and no country/operator/product was activated during this follow-up review.


## Concrete legacy-schema incompatibilities confirmed from both migration fixtures

The upgrade-order fixtures expose more than competing foreign-key roots:

- **Legacy registry first (migration fixture 196 / `017_database_country_registry`):** its existing `country_operators` table has no `verified_at` column. Migration 023 later inserts into `country_operators(..., active, verified_at)`, so it will fail on that schema unless a deliberate additive reconciliation is performed first. Its existing `country_operator_localizations` also uses the legacy composite key `(country_code, operator_key, language_code)`, while 023 expects the newer `operator_id` key shape.
- **Newer registry first (migration fixture 204 / `017_dynamic_country_registry`):** its existing `country_operator_localizations` table likewise has no `operator_id` column; it is keyed by `(country_code, operator_key, language_code)`. Migration 023 attempts to insert `operator_id`, so it is incompatible here too. Its existing `country_operators.provider_operator_id` is NOT NULL, whereas 023 seeds rows with NULL provider IDs, creating another potential NOT NULL violation when a catalog operator has no provider ID.
- In either order, `CREATE TABLE IF NOT EXISTS` does not reconcile an already-existing table's columns or foreign keys. It silently leaves the older shape in place, so 023's later statements cannot assume its preferred schema merely because the table name exists.

These are source-level incompatibilities inferred directly from the checked-in migration fixtures and 023 SQL. They have not been tested against a live database. The current migration-order integration test is diagnostic and should be extended to assert the expected 023 failure in both starting-schema variants, then replaced by a reconciliation migration with explicit preservation of all existing localization/operator rows and FK ownership.

### Required remediation before retrying 023

1. Inspect actual schema shape using `information_schema.columns`, `pg_constraint`, and row counts on a restorable clone.
2. Design one canonical `country_operators` and `country_operator_localizations` model, including a reviewed strategy for nullable/unknown provider operator IDs.
3. Migrate existing localization rows without deleting or overwriting translations; verify one-to-one operator identity before switching foreign keys.
4. Rebuild/validate child foreign keys so every country-scoped child points to the canonical country root.
5. Only after the reconciliation test passes on both historical fixtures should 023/024 be considered for a controlled release migration. No automatic startup wiring.
