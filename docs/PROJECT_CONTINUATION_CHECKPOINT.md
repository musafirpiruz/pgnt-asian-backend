# PGNT ASIAN TOPUP — Authoritative Continuation Checkpoint

Last reviewed: 2026-11-18 UTC
Repository: https://github.com/musafirpiruz/pgnt-asian-backend
Production Render service: https://pgnt-asian-backend.onrender.com
Production Render branch: `main`
Production database: `pgnt-asian-tp` (PostgreSQL 18; read-only inspection only)
Current integration PR: https://github.com/musafirpiruz/pgnt-asian-backend/pull/246
Current integration branch: `integration/four-prs-safe-review-2026-11-18`
Current integration head: `9b6800c58ff49c1be5ed8e990c6da82c045bbc74`
Safe mainline investigation branch: `fix/mainline-country-registry-safe-integration-2026-11-18`

## Mandatory continuation rules

- Continue the existing Flutter + Node.js/Express project. Do not rebuild it or repeat verified completed work.
- Fetch live GitHub PR/head/CI and Render configuration/database state before each consequential change. This checkpoint is a handoff, not a substitute for live verification.
- Keep production read-only until a reviewed migration chain, staging rehearsal, backup/restore plan, exact-head CI, and explicit release approval are complete.
- Never activate a country/operator/product or enable customer checkout from inferred or stale data.
- Never use DT One/Stripe secrets pasted into chat. Configure credentials only through the approved secret manager.
- No real Stripe charge/refund, DT One order/confirm/top-up, production migration, or production deployment without explicit user approval.
- Keep existing FIXED checkout and fulfillment behavior unchanged when extending RANGED or country functionality.
- Treat a CI pass as evidence for that exact commit only.

## Product purpose and user requirements

PGNT ASIAN TOPUP is a professional international mobile recharge app for recipients in:
- Afghanistan (AFN)
- Pakistan (PKR)
- India (INR)
- Bangladesh (BDT)

Languages: English, Pashto, Dari, Urdu, Hindi, Bengali.
Initial customer payment currency: EUR. GBP/USD are future phases; never confuse payment/settlement currency with destination currency or reference FX.

Required wider product scope:
- Dynamic country, operator and verified product selection; country-specific calling code and phone validation.
- Server-authoritative pricing, fees, Stripe fee estimates/actual reconciliation, wholesale cost, currency/FX provenance, admin fee control.
- Wallet, transaction history, support, automated transaction-status checks, failed top-up refund/review flow, FAQ and human escalation.
- Admin panel with audit trail, country/operator/product onboarding and disabled-by-default imports.
- Referral system replaces the general 2% bonus: admin-controlled invite link/code; fixed EUR 0.07 reward after the referred customer's first successful payment; server-side validation, anti-abuse, reporting and reward ledger.
- International outbound calling feature requested on 2026-11-17: calls to international mobile numbers only. Include it in the product roadmap and progress accounting, but do not imply it is implemented. It requires a separate provider/quotation, country/number coverage, regulatory, pricing, fraud, emergency-call exclusion, and sandbox acceptance review.
- Future countries should be data/config onboarding, not scattered country-specific code.

## Master catalog facts and rules

Official workbook: `PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES-1.xlsx`, sheet `All_Products`.
Previously reviewed inventory: 1,960 rows:
- AF: 542
- PK: 783
- IN: 147
- BD: 488

Product types:
- 1,929 FIXED_VALUE_RECHARGE
- 14 RANGED_VALUE_RECHARGE
- 14 FIXED_VALUE_PIN_PURCHASE
- 3 RANGED_VALUE_PAYMENT

Parser supports all five official enum values, including RANGED_VALUE_PIN_PURCHASE.
The workbook is not proof of live DT One availability or current wholesale price. Reconcile each product against genuine provider responses; do not invent currency conversion, amount, increment, operator mapping or price. Any mismatched currency (including USD provider price against EUR workbook price) is a review mismatch, not an automatic conversion.
All imports remain disabled until independently verified.

## Current PR #246 and CI — exact head

PR #246:
- Title: Integrate four-country pricing, DT One reconciliation and sandbox safety
- State: OPEN, DRAFT, unmerged; GitHub reported mergeable=true at last check.
- Base: `feat/customer-ranged-catalog-2026-11-13`
- Head: `integration/four-prs-safe-review-2026-11-18`
- Exact head: `9b6800c58ff49c1be5ed8e990c6da82c045bbc74`

Exact-head CI, all completed SUCCESS:
- Backend tests run 44222373709; PostgreSQL isolated migration checks and regression suite succeeded.
- Android APK build run 44222373738; Dart analysis, release build, APK verification and upload succeeded.
- Backend syntax run 44222373783 succeeded.
- Dependency security audit run 44222373723 succeeded.

APK artifact:
- Name: `pgnt-asian-topup-apk`
- Artifact ID: `14392050192`
- Size: 25,480,898 bytes (ZIP artifact)
- SHA256: `3be23f1a6980161b98785ae7a67fab7183c7df05cf9a6c9976e318620d68f475`
- Workflow: https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/44222373738
- Artifact UI: https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/44222373738/artifacts/14392050192
- Expires: 2026-12-02 02:24 UTC.
This build corresponds to the exact PR #246 head above. It is a CI artifact, not a Play Store release.

PR #246 contains:
- PR #243 approved master pricing policy and country previews.
- PR #245 staging-only DT One master workbook reconciliation, GET product detail adapter, migration 037.
- PR #244 disabled legacy fixed-price sandbox route (HTTP 410).
- Additional tests and workflow path coverage.
- Reconciliation uses read-only provider product detail lookups; no product import/activation, Stripe payment, DT One transaction, refund or top-up is performed.
- PR #246 migration 037 depends on migrations 032–036 and must not be deployed alone.

## Production facts — read-only verified 2026-11-18

Render service:
- Service ID: `srv-dasrbb8jo6nc73d2oen0`
- Auto-deploy branch: `main`
- Start command: `npm start`
- Region: Ohio.
- Therefore deploying PR #246's feature branch directly is not the current Render deployment path.

PostgreSQL:
- DB ID: `dpg-dbkgq059fdbs73flcqgg-a`
- Database name: `pgnt_asian_tp`
- PostgreSQL 18.
- Read-only query showed schema_migrations versions 002–016 only; no registry tables.
- No tables `country_registry`, `country_localizations`, `country_operators`, or `country_operator_products` exist in the production schema.
- Existing `product_catalog`: 9 rows (AF 7, IN 1, PK 1), all 9 inactive; 0 active.
- Production pricing_settings rows for AF/BD/IN/PK had fee_eur_cents=59, Stripe fee 1.500%, fixed fee 25 cents, and were last updated 2026-11-02. Reference values recorded then: AFN/EUR 72.9927; BDT/EUR 138.6300; INR/EUR 106.4700; PKR/EUR 310.7630.
- These values are historical reference data, not fresh DT One wholesale prices or approved customer retail prices. Do not silently replace them with remembered historical €0.49 or 60.1 AFN/EUR assumptions.
- No production database writes or migrations were made during this inspection.

## Critical integration mismatch and reason not to merge PR #246 directly

The device APK built from PR #246 calls:
- `GET /api/countries/:countryCode/operators`

That route is present in the PR feature branch but absent from production `main`, explaining the observed HTTP 404.
However, simply merging PR #246 to its current base does not deploy it to Render, because Render deploys `main`.
Changing PR #246 base to `main` would import a large, long feature branch stack (hundreds of commits) and a migration chain that production does not have. This is unsafe.

PR #246's ancestry includes country-registry/FX/bootstrap branches and PRs #225, #234–#245. Several are still open/draft. Do not flatten or bulk-merge this stack without reviewing each dependency and schema.

## Migration and schema safety gate

Production is at schema migrations 002–016. PR #246's migration 037 expects preceding migrations 032–036; registry bootstrap work includes migration 023 and related migrations 017–031. The existing production database has neither the registry tables nor these later migrations.
Before production deploy:
1. Inventory every migration 017–037 and the exact invocation/order in migrate.js.
2. Map each migration's prerequisites and existing schema assumptions against the actual production schema, including the legacy registry alternatives described in tests.
3. Do not loosen fail-closed migration checks or silently reconcile incompatible registry roots. Existing tests deliberately require incompatible legacy schemas to be rejected without damaging existing rows.
4. Build a narrow, ordered mainline integration that includes only required, reviewed dependencies.
5. Rehearse from a production-like schema snapshot in isolated PostgreSQL, including rollback/failure cases and preservation of existing orders, wallet/ledger, refunds, referrals and catalog data.
6. Take/verify a production backup and rehearse restore before any approved production migration.
7. Keep all imported products and operator/provider mappings inactive until genuine DT One evidence and independent review pass.

## Current next work — ordered

1. Read this checkpoint, then fetch live PR #246 and exact head CI again.
2. Inspect all open PR dependencies and migration history; produce a dependency graph for the 017–037 sequence and reconcile it with production's actual 002–016 schema.
3. On `fix/mainline-country-registry-safe-integration-2026-11-18`, build a narrow integration proposal based on `main`, not a bulk merge of PR #246. Do not copy registry routes until their schema and auth/activation contracts are matched.
4. Add migration-order tests against a copy of the actual production schema. Preserve fail-closed behavior.
5. Implement the customer operator endpoint only after active verified operator mappings can exist in the canonical schema. If there is no verified mapping, return an empty list, not guessed networks.
6. Verify DT One pre-production GET product details using securely configured sandbox credentials; record country/operator/product ID, destination currency/amount/range/increment, wholesale currency and price, evidence timestamp, and reviewer. GET-only first. No create/confirm.
7. Verify country FX separately with provenance and approval. FX reference values do not substitute for provider wholesale costs.
8. Reconcile every workbook row; mark exact matches, mismatches, missing products, and provider errors. Never auto-import or activate.
9. Once the narrow mainline branch is tested, open a PR to main and review. Only deploy after explicit approval and safe migration rehearsal.
10. After backend API deployment, install the new APK on physical Android device and verify country/operator/product lists, language changes, phone validation, quote and safe failure paths. Do not use real payment/top-up for acceptance.
11. Continue remaining roadmap: wallet/referral/support/refunds/admin/Play Store, plus international mobile calling as a separately gated feature.

## Do not claim complete

- Do not say the four-country network list is fixed until live verified operator mappings are present and endpoint works against the deployed schema.
- Do not say all country rates are confirmed based on pricing_settings or generic FX.
- Do not say the app is production-ready because CI/APK succeeded.
- Do not say international calling is implemented; it is currently a roadmap requirement only.
- Do not say products are available/active; production catalog currently contains 9 disabled records.
- Do not merge, deploy, migrate production, activate products, or enable ranged checkout until all applicable gates pass and user approval is explicit.

## User-facing handoff

Explain progress in Pashto, distinguish confirmed from pending work, use actual percentages only when there is a defined checklist and evidence. Include the international-calling feature in project scope/progress, but separate it from top-up readiness.


## Detailed migration-order finding — verified 2026-11-18

Inspection of the actual `migrate.js` on PR #246 head shows this sequence:
- 017 `country_operator_product_mapping` is conditional and is deferred until `country_registry` and `country_operators` already exist.
- 018 `dtone_ranged_value_foundation`
- 019 `ranged_order_identity`
- 020 `ranged_confirmation_claim`
- 022 `canonical_country_registry_reconciliation`
- 023 `current_catalog_country_registry_bootstrap`
- 024 `country_fx_rates`
- 030 `country_registry_audit_trail`
- 031 `order_country_configuration_snapshot`
- 032 `master_country_pricing_policy`
- 033 `network_product_approval_batches`
- 034 `dtone_price_evidence_freshness`
- 035 `stripe_actual_fee_reconciliation`
- 036 `four_country_app_fee_eur_049`
- 037 `dtone_master_reconciliation_staging`

There is no migration 021 in this invocation list, and migrations 025–029 are not in the automatic list; code comments explicitly identify 029 as a separately reviewed/manual rollout gate. Do not fill these numbering gaps by inventing migrations or assuming they are required. Determine whether each is intentionally absent, manually gated, superseded, or still needed by inspecting the repository history and every dependent module/test.

Important additional finding: migration 022/023 are not a generic "apply all" operation. They are intended to reconcile canonical country-registry schemas and seed from the current catalog; migration 023 contains fail-closed validation for pricing/currency and rejects conflicting existing registry identities. Tests expect incompatible legacy schemas to fail without damaging rows. Production currently has no registry tables and only migrations 002–016, so these migrations need a production-shaped rehearsal and review before any live execution.

Fresh CI recheck on exact PR #246 head `9b6800c58ff49c1be5ed8e990c6da82c045bbc74` (2026-11-18):
- Backend tests run 44222373709 / run #1905: SUCCESS; all 27 job steps completed, including isolated PostgreSQL migration/reconciliation checks and regression tests.
- APK build run 44222373738 / run #951: SUCCESS; Dart analysis, release APK build, APK verification and artifact upload all succeeded.
- Syntax run 44222373783 / run #1602: SUCCESS.
- Dependency security audit run 44222373723 / run #763: SUCCESS.
- Artifact `pgnt-asian-topup-apk`, ID `14392050192`, 25,480,898 bytes, SHA256 `3be23f1a6980161b98785ae7a67fab7183c7df05cf9a6c9976e318620d68f475`, expiry 2026-12-02.
These green workflows validate only that exact PR head; they do not prove safe production migration or deployment.
