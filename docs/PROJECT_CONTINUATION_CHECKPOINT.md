# PGNT ASIAN TOPUP — Project Continuation Checkpoint

Last updated: 2026-11-14
Repository: musafirpiruz/pgnt-asian-backend
Active PR: https://github.com/musafirpiruz/pgnt-asian-backend/pull/242
Branch: feat/customer-ranged-catalog-2026-11-13
Current branch head: always fetch live from PR #242 before editing; last implementation commit before checkpoint-only updates: d27289df703dd788061e95af65b40084d2c9655e.

## Why this checkpoint exists
Continue the existing PGNT ASIAN TOPUP project from its current implementation. Do not rebuild from scratch, repeat completed work, or change unrelated working features.

## Current scope
Customer-facing verified DT One ranged recharge catalog for Afghanistan, Pakistan, India, and Bangladesh, supporting customer-selected destination amounts from 75 to 3000 only where DT One has explicitly verified the product's range, currency, calculation mode, and increment.

## Confirmed completed work
- Read-only customer endpoint: GET /api/countries/:countryCode/ranged-products.
- Endpoint returns only active, verified DT One destination-amount capabilities and public identity/range fields.
- Country mappings: AF -> AFG, PK -> PAK, IN -> IND, BD -> BGD; destination currency is matched against country registry.
- Customer amount bounds are clamped to 75..3000 and provider increments are preserved.
- Operator filter is parameterized.
- Admin import route imports verified ranged product metadata disabled; it does not create a top-up or payment.
- Flutter UI lists verified ranged capabilities, allows selection and local amount validation, and keeps ranged payment blocked.
- Migration 018 provides ranged product/capability/transaction foundation.
- Migration 019 adds FIXED/RANGED order identity while preserving old orders as FIXED, permits nullable product_id for ranged orders, adds identity constraints and a restricted FK.
- Migration 019 is explicitly invoked through migrate.js; it is not run automatically at server startup.
- Existing fixed checkout path remains unchanged.
- Added PostgreSQL integration assertion for migration 019 in tests/ranged-order-identity-019.integration.sql.
- Corrected that SQL test to inspect orders.product_id nullability separately from fulfillment_type default.

## Latest CI for current head 47589cbc4989896ed371825e02600be13cc89547
- Backend Syntax Check: SUCCESS
  https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/43542633316
- Backend tests, including PostgreSQL migration 019 assertions: SUCCESS
  https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/43542633248
- Android APK build: SUCCESS; Dart analysis, release APK build, APK verification, and artifact upload all passed.
  https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/43542633271

## Current implementation boundary
- The separate ranged quote/checkout route and ranged branch in the Stripe paid-session webhook are NOT implemented yet.
- The pure pricing/request/confirmation helpers and unit tests exist, but no customer ranged payment is enabled.
- The next implementation must use a separate RANGED path and preserve the existing FIXED checkout and fulfillment behavior.

Earlier failed run 43542061313 was on the prior commit and its test assertion bug has been corrected. Do not treat that old failure as current head status.

## Explicit product and safety requirements
- Do not rebuild the app or backend.
- Keep fixed-value product checkout and fulfillment unchanged.
- Ranged checkout must be a separate server-authoritative flow.
- Never trust client-supplied wholesale price or final price.
- Do not enable ranged payment until server quote, EUR Stripe checkout, and DT One two-step create/confirm lifecycle are implemented and tested.
- For ranged DT One create, use auto_confirm:false; verify CREATED state, product/order/external identity, destination amount/currency, and confirmation deadline.
- On canonical Stripe paid webhook, confirm DT One exactly once with database locking/idempotency; verify final identity/status. Ambiguous timeout/expiry goes to review; never blindly retry or recreate.
- Require explicit provider wholesale EUR pricing evidence; fail closed if absent or currency is ambiguous.
- No real payment, real top-up, production migration, product activation, deployment, or merge without explicit user approval.
- PR #242 remains OPEN and DRAFT. Current-head syntax, backend tests, Dart analysis, and APK build passed. Do not merge until ranged checkout/webhook implementation and review are complete.

## Next tasks (continue in this order)
1. APK build on current head is now successful. Continue with the separate ranged quote/checkout and Stripe webhook implementation.
2. Inspect server.js Stripe webhook and processPaidStripeSession, migration 018/019 schema, dtone-ranged-pricing.js, and dtone-ranged.js.
3. Implement separate ranged quote/checkout endpoint without modifying /api/payments/checkout fixed flow.
4. Persist ranged orders with fulfillment_type='RANGED', product_id=NULL, ranged_product_id set, and ledger state.
5. Add canonical Stripe EUR checkout with idempotency and server-side price calculation.
6. Add one-time DT One confirmation in paid webhook with locking, identity checks, expiry/timeout review handling.
7. Add mocked regression tests: duplicate webhook, quote expiry, provider timeout, identity mismatch, and fixed-flow isolation.
8. Run all CI; keep feature blocked until all checks pass.
9. Only after user approval consider merge, production migration, product activation, or deployment.

## User's existing business requirements to preserve
- Countries: Afghanistan, Pakistan, India, Bangladesh.
- Languages: English, Pashto, Dari, Urdu, Hindi, Bengali.
- EUR is the initial customer payment currency; USD and GBP are future phases after the core country/product flow.
- Admin-controlled pricing/fees and currency conversion.
- Referral system replaces general 2% bonus: admin-controlled referral code/link, fixed EUR 0.07 reward after referred customer's first successful payment, server verification, anti-abuse controls, reporting, and reward ledger.
- Support system, refunds/review, wallet, history, and admin controls remain part of the wider roadmap.
- Only display DT One-supported amount values/ranges and increments; do not invent unsupported amounts.


## Continuation update — 2026-11-14 (latest verified repository state)
- Latest branch head: 606639d2c0bd746debc7c7d64cfdf4efaea11523.
- Added migration 020_ranged_confirmation_claim in migrate.js. It extends the ranged transaction provider status constraint with CONFIRMING, allowing a durable one-time claim before the DT One confirmation call. Migration remains explicit; it has NOT been applied to production.
- Updated tests/ranged-order-identity-019.integration.sql to assert migration 020 and CONFIRMING status support.
- Backend Syntax Check passed for commit 18a6864e317610bedd8fcd3393637ba50ba34606.
- Backend tests on that commit failed because the integration SQL block terminator was accidentally written as END $; the file has now been corrected to END $$; in commit 606639d2c0bd746debc7c7d64cfdf4efaea11523. A new CI run for this exact latest commit is required before calling the test green.
- Android APK build for commit 18a6864e317610bedd8fcd3393637ba50ba34606 was still in progress at the last check; verify its result and rerun on latest commit as required.
- PR #242 remains OPEN and DRAFT; no merge, production deploy, production migration, product activation, real payment, or real top-up has occurred.
- The ranged checkout route and ranged Stripe webhook fulfillment branch are STILL NOT IMPLEMENTED. Do not claim customer ranged payments are working.
- Continue from this branch and latest commit. Do not recreate the ranged catalog, migrations 018/019, migration 020, existing helper modules/tests, or Flutter ranged UI. Next implement the separate server-side RANGED checkout and exactly-once webhook lifecycle, then add regression tests and verify all CI on the exact final commit.


## AUTHORITATIVE CONTINUATION STATE — verified 2026-11-14
This section supersedes any older "latest head" or CI statements above. Always read this section first when continuing the project in a new chat.

- Repository: https://github.com/musafirpiruz/pgnt-asian-backend
- Active branch: `feat/customer-ranged-catalog-2026-11-13`
- Active PR: https://github.com/musafirpiruz/pgnt-asian-backend/pull/242
- Verified PR state before this checkpoint update: OPEN, DRAFT, not merged. Mergeability is recalculated by GitHub and must be checked live.
- Last implementation commit before this checkpoint-only documentation update: `d27289df703dd788061e95af65b40084d2c9655e`.
- CI for last implementation commit d27289df703dd788061e95af65b40084d2c9655e:
  - Backend Tests: SUCCESS — https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/43543486326
  - Backend Syntax Check: SUCCESS — https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/43543486234
  - Android APK Build: SUCCESS, including Dart analysis, release APK build, APK verification and artifact upload — https://github.com/musafirpiruz/pgnt-asian-backend/actions/runs/43543486204
- The Android APK workflow was green on implementation commit `d27289df703dd788061e95af65b40084d2c9655e`; do not repeat the APK setup/build work unless source changes require a new build.
- Completed implementation to preserve: customer ranged catalog endpoint; disabled-only verified DT One ranged product import; Flutter ranged product selection and local amount validation; migrations 018, 019 and 020; helper module `dtone-ranged.js`; helper module `dtone-ranged-pricing.js`; existing pricing/identity/confirmation unit tests; PostgreSQL migration assertions; existing FIXED checkout and fulfillment flow.
- Migration 020 permits the durable `CONFIRMING` state. It is defined in `migrate.js` and has been exercised by isolated PostgreSQL CI migrations; it has NOT been applied to production.
- Still NOT implemented: separate server-authoritative RANGED quote/checkout endpoint; RANGED order/transaction persistence and Stripe session creation; RANGED branch in `processPaidStripeSession`; durable one-time DT One confirm request and verified response handling; RANGED duplicate-webhook/expiry/timeout/review regression tests. Ranged customer payment remains blocked.
- The existing `/api/payments/checkout` and FIXED fulfillment must remain behaviorally unchanged.
- Do not recreate completed files, migrations, helpers, Flutter ranged UI, or tests. Inspect them and extend them only where necessary.
- No merge, production deployment, production migration, product activation, real Stripe payment, or real DT One top-up without the user's explicit approval.
- Next work: implement and test the missing RANGED checkout and paid-webhook lifecycle in the existing branch, then rerun CI on the resulting exact head. Do not make another documentation-only commit unless the checkpoint materially changes.

## New-chat handoff instruction
Continue PGNT ASIAN TOPUP from this repository, branch, PR, and this checkpoint. First fetch the latest PR head and this checkpoint. Preserve every completed item above; do not rebuild or repeat them. Work only on the listed missing RANGED checkout/webhook lifecycle and its regression tests. Keep RANGED payment blocked until tests pass. Never merge, deploy, run production migrations, activate products, or perform real payments/top-ups without explicit user approval.


## AUTHORITATIVE HANDOFF — 2026-11-14 (supersedes all earlier status sections)

### Live GitHub state verified
- Repository: https://github.com/musafirpiruz/pgnt-asian-backend
- Branch: `feat/customer-ranged-catalog-2026-11-13`
- PR: https://github.com/musafirpiruz/pgnt-asian-backend/pull/242
- Exact HEAD at verification: `9f85d5c10dc6c1a0c34b2d56f39879d69b39650f`
- PR state: OPEN, DRAFT, not merged; GitHub reported mergeable=true at this check.
- CI attached to this exact HEAD:
  - Backend Syntax Check: SUCCESS — run 43545200737.
  - Backend tests: SUCCESS — run 43545200803.
  - Android APK Build: IN_PROGRESS — run 43545200729, job 132294789564. Do not call APK build passed until a completed successful run is verified.
- Latest source changes include the separate RANGED checkout service and server webhook/callback handling. Older sections in this file that say those features are not implemented are superseded by the implementation status below.

### Verified implementation present at HEAD
- Customer ranged catalog route and Flutter selection/amount validation remain present.
- Country foundations present:
  - `country-config.js`: static definitions for AF/PK/IN/BD (AFN/PKR/INR/BDT, calling codes and phone lengths).
  - `country-registry.js`: validates ACTIVE database registry rows and builds immutable country config.
  - `country-registry-runtime.js`: atomic refresh/snapshot manager with last-known-good behavior on failed refresh.
  - `country-activation-policy.js`: fail-closed activation gate requiring valid country/provider mapping, verified operators/products, all six localizations, active EUR pricing, fresh matching FX and approved recent sandbox evidence.
  - Migration `023_current_catalog_country_registry_bootstrap.sql`: creates country, localization, operator and operator-product registry tables and seeds the existing four markets in non-active/legacy state; provider operator/product mappings are deliberately inactive/unverified.
  - Migrations 024–029 also exist for FX, wallet ledger foundation, provider metadata, product identity, ranged order identity and sandbox evidence.
- RANGED checkout/fulfillment implementation present:
  - Separate `ranged-checkout-service.js` and `POST /api/payments/ranged-checkout`.
  - Server-authoritative product/range/amount/phone/currency validation and DT One async quote; EUR pricing calculated server-side; RANGED order and provider transaction persisted; Stripe EUR Checkout created.
  - RANGED checkout remains fail-closed behind `RANGED_CHECKOUT_ENABLED !== 'true'`; do not enable without provider contract and end-to-end validation.
  - Paid Stripe webhook has separate RANGED processing; durable CREATED → CONFIRMING claim is committed before DT One confirm request; duplicate webhook does not repeat confirmation; identity/status is rechecked; ambiguous outcomes go to REVIEW rather than blind retry.
  - RANGED DT One callback validates transaction/order/product identity and reconciles final provider status.
  - Existing FIXED checkout route and fulfillment remain separate and must not be behaviorally changed.
  - RANGED referral is intentionally blocked pending secure identity controls.
- Tests present for ranged pricing, checkout, amount validation, duplicate webhook safety, identity mismatch, callback reconciliation, Stripe failure/review path and migration assertions.

### Important architecture gap — next implementation task
- Although DB-backed country registry, runtime snapshot manager and activation policy exist, `server.js` still imports `COUNTRY_CURRENCIES` and `SUPPORTED_COUNTRIES` from static `country-config.js`. The runtime registry is not yet the single source of truth throughout request validation, phone validation, ranged catalog country mapping, pricing/FX and Admin Panel workflows.
- Next chat MUST continue this exact branch and close this integration gap. Do not recreate registry tables, migration 023–029, activation policy, or runtime manager.
- Trace all uses of `SUPPORTED_COUNTRIES`, `COUNTRY_CURRENCIES`, `getCountryConfig`, country-code allowlists, phone validation and DT One country mappings. Replace hard-coded country assumptions with one validated active registry snapshot where safe.
- Ensure startup/refresh behavior fails closed for customer-facing country operations if the registry is unavailable/stale; never silently fall back to static countries for activation or payment decisions. Preserve legacy/static bootstrap only where explicitly required for backward compatibility.
- Build Admin Panel country lifecycle around DRAFT/CONFIGURING/TESTING/ACTIVE/DISABLED with audit trail and strict activation gate. Never auto-activate imported countries, operators or products.
- New country onboarding should require ISO country/currency, calling code and phone rules, provider country/operator/product identity, verified product/currency/range/pricing, FX freshness, six localizations (en, ps, fa, ur, hi, bn), and approved sandbox connectivity/quote/success/failure callback evidence.
- Keep EUR as initial customer payment currency. USD/GBP are later phases; do not mix destination currency with settlement currency.
- Preserve AF/PK/IN/BD and existing fixed product flow. Future markets must be data/config additions rather than scattered code edits.

### Handoff safety and verification
- Do not merge PR #242, deploy, run production migrations, activate products/countries, enable ranged checkout, or execute real payments/top-ups without explicit user approval.
- Before editing in a new chat: fetch live PR #242 head; read this authoritative handoff; inspect actual current files and CI for that exact head. Never trust old SHA/run status in older sections.
- After code changes: run backend tests, syntax check, Dart analysis and APK build on the exact resulting HEAD; review all failures and rerun after fixes.
- The user explicitly requires this checkpoint to be read and completed work verified at the start of the next chat. Do not restart or repeat completed work.


## Continuation update — 2026-11-14 (latest verified state)

- Active PR: #242, OPEN and DRAFT; branch `feat/customer-ranged-catalog-2026-11-13`; base `feat/device-region-and-country-bootstrap-2026-11-10`.
- Latest HEAD: `4e447608919df61d7fb27814ad3e063ee5f79fa2`.
- Latest commits in this correction sequence:
  - `933f56f8180b0e3fb3aa25c4149bff0843337795`: restore migration 023's fail-closed behavior for incompatible pre-existing country registry schemas. The prior attempt to loosen legacy constraints was reverted because tests deliberately require legacy 196 and newer 204 competing schemas to be rejected without damaging existing rows.
  - `75071bb69ef4c95ecccc934ce4cc2096e421483f`: attempted test assertion adjustment (still had over-escaped regex).
  - `4e447608919df61d7fb27814ad3e063ee5f79fa2`: corrected runtime test regular expressions using proper JS regex escapes.
- CI for latest HEAD:
  - Backend Syntax Check: SUCCESS (run `43597313789`, job `132454489819`).
  - Backend Tests: IN PROGRESS at last check (run `43597313776`, job `132454489566`).
  - Android APK Build: IN PROGRESS at last check (run `43597313785`, job `132454489699`).
- Previous Backend Tests run `43597103954` had 428 passed, 3 failed. Two failures were the migration compatibility tests for legacy 196 / newer 204; one was the runtime test's over-escaped regex. Do not treat those old failures as current final status; latest code corrected migration fail-closed behavior and the regex, and new CI is pending.
- Earlier investigation confirmed migration 023 should NOT silently reconcile/alter incompatible legacy schemas. Tests expect transactional rejection and preservation of existing rows. Keep that security behavior.
- Registry runtime is initialized in server.js from the DB pool with 60-second freshness; customer ranged route uses getFreshSnapshot and fails closed.
- Do not merge PR, apply production migrations, activate countries/products, enable ranged checkout, or perform real payments/top-ups. User has not authorized those actions.
- Next action: poll CI for HEAD `4e447608919df61d7fb27814ad3e063ee5f79fa2`. If tests fail, inspect exact failing test names/logs and fix the underlying issue, not by weakening safety assertions. If CI passes, continue integrating country registry lifecycle/admin/audit into server routes while preserving fixed checkout.
- User explicitly asked for a reliable handoff in case this chat ends. This section is the latest project continuation state.
