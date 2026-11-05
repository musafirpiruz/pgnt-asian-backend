# PR #196–#203 Reconciliation Audit

Date: 2026-11-04

Status: review-only reconciliation branch. This document does not authorize merging, deployment, database migration, activation, payment, refund, or OTP enablement.

## Baseline

- Target integration head: `b1c619f1368f63ef04497170f95bbc93b9185907` (`feat/dynamic-country-onboarding`, PR #204).
- Latest recorded CI on that exact head: backend tests (239 passing), syntax, dependency audit, Android release APK build and APK verification passed.
- PR #204 has no independent review approval recorded in the prior review.
- Git ancestry comparisons show #204 diverges from the heads of #196–#203. The unique commits are not automatically included merely because #204 is ahead of main.

## Verified feature areas requiring source-level reconciliation

| Source PR / branch | Verified source-side addition | Required action against #204 |
|---|---|---|
| #198 `fix/checkout-product-operator-validation` | `tests/checkout-product-selection.test.js` checks country/operator/amount validation before pricing and requires operator + amount even with a product ID | Confirm equivalent server-side guards exist and add regression coverage to the current implementation |
| #199 / #200 `feat/explicit-country-operator-product-mapping` | `tests/operator-identity-forwarding.test.js` checks stable operatorKey/providerOperatorId forwarding and verification | Verify Flutter sends stable IDs, backend rejects partial/unverified IDs, and quote + checkout use the verified operator |
| #200 `feat/explicit-country-operator-product-mapping` | `country_operator_products` mapping, guarded product lookup, admin mapping endpoint, inactive-by-default behavior, and `tests/country-operator-product-mapping.test.js` | Reconcile schema and routes with #204's different migration numbering; do not copy migration 019 blindly because #204 uses 019 for country pricing |
| #203 `feat/automatic-four-country-fx-rates` | `fx-rates.js` and `tests/fx-rates.test.js` validate AFN/PKR/INR/BDT dated EUR-base quotes and update legacy four-country pricing rows atomically | Compare behavior with #204's generic FX implementation and ensure existing four-country pricing remains supported; avoid duplicate or conflicting FX writers |

## Important migration conflict

The earlier explicit product-mapping branch defines migration `019_country_operator_product_mapping`. PR #204 uses migration 019 for `019_country_pricing_settings`. These migrations cannot be merged by copying their original version identifiers. Any mapping schema must receive a new unique migration version after checking the complete current migration chain, constraints, and existing data.

## Safe implementation sequence

1. Inspect the exact current #204 implementations of `validateCheckoutInput`, `getVerifiedCountryOperator`, `getProduct`, quote and checkout routes, Flutter quote/checkout payloads, and the FX refresh routes.
2. Add or adapt regression tests against the current schema and route contracts. Preserve legacy curated-operator behavior only where it is explicitly intended and tested.
3. If the explicit operator↔catalog mapping table is required, add it through a new additive migration version; keep all new mappings inactive by default and validate provider country/operator/product identity before saving.
4. Reconcile generic and four-country FX refresh into one non-conflicting strategy with source timestamps, freshness checks, atomic writes, and preservation of last valid rates on provider failure.
5. Run the complete backend suite, SQL migration integration tests, security audit, Dart analysis and release APK build on the resulting exact head.
6. Obtain independent human review and perform backup/restore validation before any merge or deployment decision.

## Explicitly out of scope for this reconciliation pass

The six separately deferred acceptance tasks (DT One live/sandbox verification, Stripe/DT One end-to-end payment/refund/callback testing, Support acceptance, Firebase SMS OTP, physical-device acceptance, and release/deployment) remain deferred as requested.

No live payment, refund, top-up, product activation, OTP enablement, Render deployment, or production migration is performed by this branch.
## Follow-up source inspection (2026-11-04)

A direct comparison of the PR #204 candidate against the source PR patches found concrete reconciliation requirements:

1. **Checkout product selection regression:** PR #198 adds checks that the selected catalog product matches the requested country, operator, and denomination, and that operator plus amount are required even when a product ID is supplied. In the inspected #204 validateCheckoutInput, operator/amount are required only when productId is absent; the checkout route checks country but does not visibly compare the resolved product's operator and local amount with the submitted selection before pricing. Port the #198 protections as tests and implementation, while preserving legitimate catalog-ID flows.
2. **Operator identity forwarding:** PR #199 tests that Flutter forwards operatorKey and providerOperatorId to both quote and checkout, and that the backend verifies the exact active registry mapping. The inspected #204 main.dart has no operatorKey or providerOperatorId references. This remains a client/server contract gap for registry-backed operators.
3. **Explicit catalog mapping:** PR #200 introduces country_operator_products, inactive-by-default admin mapping, provider product/operator verification, and tests. These files/features are absent from the inspected #204 candidate file set. Reconcile with a newly numbered migration; do not copy migration 019 because #204 already assigns 019 to country pricing.
4. **Legacy FX behavior:** PR #203 adds four-country dated EUR→AFN/PKR/INR/BDT refresh and history. #204's dynamic-country FX design is different and must not create a second competing writer. Decide on one authoritative refresh path and add coverage for the existing four-country pricing settings before enabling any scheduler.

### Required implementation gate

Do not merge #204 or #206 until the checkout selection tests, operator identity contract, explicit catalog mapping migration/API/admin workflow, and a single-source FX strategy are implemented and the full CI suite passes. The six user-deferred acceptance tasks remain out of scope for this reconciliation session.

## CI and implementation update (2026-11-04)

- PR #206 head: `d0e2e49b1a5ae5f34c10d0d3a9355297b18b14a1`.
- Backend Syntax Check run `41752919063`: completed successfully.
- Backend tests run `41752919132`: completed successfully. Its PostgreSQL migration/integration steps and regression test step all completed successfully.
- Checkout product-selection guard is implemented on this review branch in `server.js`: operator and positive integer amount are required even when productId is supplied; resolved product country, operator name and local amount are checked before pricing. Regression tests are in `tests/checkout-product-selection.test.js`.
- The checkout-selection item above is therefore implemented and tested on PR #206, not yet merged to the integration branch.
- Remaining blockers: stable operatorKey/providerOperatorId forwarding and server-side active registry verification; explicit inactive-by-default country/operator/product mapping and a uniquely numbered additive migration; one authoritative FX refresh strategy with dated/freshness-checked rates and legacy-country coverage.
- PR #206 remains a draft review PR. No merge, production deployment, live transaction, product activation, SMS OTP enablement, or migration against production has occurred.


## Priority review and safe implementation update (2026-11-04)

### PR and exact-head CI verification

The following PRs were re-read from GitHub. Each PR remains open and unmerged; the listed checks completed successfully on the exact head SHA recorded below.

| PR | Head SHA (short) | State / base | Exact-head checks |
|---|---|---|---|
| #196 | `40c832a` | Open, base `main` | Backend tests, syntax, dependency audit, Android APK build — all passed |
| #197 | `122a264` | Open, based on #196 branch | Backend tests and syntax — both passed |
| #198 | `1600412` | Open, based on #197 branch | Backend tests and syntax — both passed |
| #199 | `d64c744` | Open, based on #198 branch | Backend tests and syntax — both passed |
| #200 | `ccc2989` | Open, based on #199 branch | Backend tests and syntax — both passed |
| #201 | `94f8199` | Open, base `main` | Backend tests, syntax, dependency audit — all passed |

These are stacked PRs (#197 → #196, #198 → #197, #199 → #198, #200 → #199), not six independent merge candidates. PR #201 is separate. Passing checks do not mean these PRs are merged or production-ready.

### Country, operator, product and pricing security review

- New country records are created as `draft`; customer discovery exposes only `active` or explicitly grandfathered `legacy` countries. The admin preflight requires a verified provider-country mapping, phone rules, active operator/product, active country pricing, fresh FX and complete translations before activation.
- DT One country/product discovery is read-only by default. Catalog import requires explicit confirmation and imported products remain disabled. Provider country, product/operator identity, denomination currency and wholesale/retail currency units are checked. A missing/stale FX quote blocks conversion rather than inventing a rate.
- PR #198's product-selection guard is present on this review branch: a supplied product ID must still match the selected country, operator and denomination before pricing.
- A further contract gap was found in #204: registry operator identifiers were not being forwarded by Flutter, so the backend could not bind a selected dynamic operator to the exact provider operator and product. This review branch now exposes `providerOperatorId` from the customer operator endpoint, carries `operatorKey` and `providerOperatorId` from Flutter through both price quote and checkout, verifies the active operator and verified country mapping server-side, and restricts registry-backed product lookup to the matching verified `country_products` row and provider product ID. Existing legacy-country name-based selection remains available only for legacy countries.
- The explicit mapping table proposed by PR #200 is not copied as migration 019 because #204 already uses that version for country pricing. The current `country_products` table already stores country, operator ID, provider product ID, verification state and activation state; the implementation reuses this relationship rather than introducing a conflicting duplicate table.
- Pricing remains EUR-based for Stripe. Dynamic settlement FX currently has one Frankfurter source with a five-day freshness limit and no approved independent fallback. Frankfurter's current official currency catalogue lists AFN, BDT, INR and PKR as active currencies, but the exact live EUR-pair payload/date and stale-rate behavior must still be exercised by automated tests before activation. PR #203's separate legacy four-country scheduler is not integrated here; do not run two competing FX writers or overwrite the existing AFN/PKR/INR/BDT pricing settings. Currency catalogue reference: https://frankfurter.dev/currencies/.

### Support, Wallet and Refund status

- **Support:** Flutter submits tickets and reads ticket history through the registered `support-routes.js` endpoints. Customer access is proven by a per-order token whose SHA-256 hash is stored server-side and compared with `timingSafeEqual`; admin inbox and replies use `requireAdmin`. Runtime mock-database tests have been added for missing/wrong tokens, successful ticket creation, order-scoped history and admin middleware. This is a database-backed ticket workflow, not yet an email/push/live-agent notification integration; notification delivery and operational response SLA remain outstanding.
- **Wallet:** no customer balance/history/deposit/spend API is enabled. Flutter still shows a placeholder balance. Admin diagnostics and migration preflight are read-only and report ledger consistency, duplicate references, negative balances, uniqueness and cascade-retention risks. Wallet activation remains blocked pending stable Firebase UID-to-wallet identity binding, approved immutable ledger and retention rules, concurrency-safe/idempotent writes, reconciliation, and a separately reviewed backup/restore and rollback plan.
- **Refund:** an admin-only Stripe refund route exists and requires a final DT One failure, a matching succeeded EUR PaymentIntent, exact order metadata/amount/environment, a unique reservation and Stripe idempotency. Ambiguous or existing pending refunds require manual Stripe reconciliation; completed orders are rejected. A new `REFUNDS_ENABLED=true` deployment flag now fails closed by default before database or Stripe access. The flag is not enabled here; no refund was initiated. Support refund tickets do not themselves execute a refund.
- Refund/Stripe/DT One end-to-end acceptance remains a test-mode task; no production refund, payment, top-up, wallet write, SMS OTP, migration or deployment was performed.

### Code and test changes on the draft review branch

1. Enforced the existing checkout product/country/operator/amount cross-check (PR #198 protection).
2. Added stable operator key/provider ID forwarding and server-side verified operator/product binding.
3. Added runtime support-route tests using a mock database; no external service is called.
4. Added a default-off refund feature flag and a source-level test proving it is checked before database/Stripe work.
5. Added operator-identity regression tests and updated checkout selection tests.

The branch remains a draft review branch. Wait for its exact-head backend tests and syntax checks, review their logs, and resolve any failures before treating these changes as complete. PRs remain unmerged; no production migration/deployment, real payment/refund, or product activation is authorized by this work.


### Additional UI alignment and CI coverage

- The Flutter amount selector now groups active catalog denominations by the backend's `operatorCode`; selecting a network changes the available amounts to that network's products only. The server still independently verifies country/operator/amount before checkout.
- Country preflight now rejects an active network that has no verified active product. It also checks that each active `country_products` record has an exact active `product_catalog` counterpart with matching provider product ID, operator, denomination, destination currency, wholesale EUR cents and retail EUR cents. Quote/checkout repeat this mapping-and-price parity check, so an out-of-band catalog price edit fails closed. Customer operator/product discovery and checkout also require `verified_at` on active registry operators, preventing an accidentally flagged but unverified operator from appearing as a selectable network.
- The APK workflow previously filtered pull requests to target `main` only, so it did not run for draft PR #206, whose base is `feat/dynamic-country-onboarding`. The workflow now includes that feature branch as a pull-request target, so Dart analysis and the release APK build run for this review chain as well.
- This workflow change affects CI only; it does not deploy the APK or publish it to the Play Store.


### PR #197 localization migration reconciliation

PR #197 proposed migration version 018, but this review branch already assigns version 018 to global provider FX and 022 to country-currency discovery. To avoid a version collision, the reviewed AF/PK/IN/BD labels from #197 are applied in additive migration `023_repair_country_localizations`. It upserts only the 24 country/language label rows and clears their fallback marker; it does not touch pricing, products, orders, refunds or wallet records. A dedicated migration regression test was added.


### PR #201 dependency CI reconciliation

The review branch already carries the #201 runtime/dependency set (`Node >=22 <25`, `.node-version 22.22.0`, `firebase-admin 14.5.0`, and the `glob`/`minimatch` overrides). Its backend test workflow is also on Node 22. The dependency audit workflow previously targeted PRs to `main` only, so it now also runs for PRs targeting `feat/dynamic-country-onboarding`; this keeps the same enforced production and full-tree `npm audit --audit-level=moderate` gate active on draft PR #206.


### Legacy-country isolation and admin catalog fix

A further compatibility review found that the new dynamic pricing table is only used when a country has no legacy `pricing_settings` row. The four seeded `legacy` countries therefore must not be moved through the new currency/provider/catalog activation workflow. The review branch now locks legacy currency discovery/selection, DT One remapping/import, dynamic country pricing, operator/product review, preflight, activation and disable operations. Their customer operator/product APIs always read the original active `product_catalog`, and checkout rejects dynamic operator IDs for legacy countries. New `active` countries require a verified mapping and registry operator IDs; `disabled`, draft and other non-customer-visible statuses are rejected by the checkout identity guard.

The customer registry APIs now require a verified provider-country mapping before exposing dynamic operators/products. The admin operator-list endpoint also had an extra unused SQL bind parameter (two values supplied to a one-parameter query); it now supplies only the country code. Regression tests cover the legacy lock, direct legacy catalog branch, provider mapping requirement and corrected SQL binding.


## Acceptance verification — 2026-11-05

This section records the scheduled acceptance review. All checks in this section were read-only, CI/mock based, or documentation review. No merge, production deploy, production migration, live charge/refund/top-up, catalog activation, or SMS enablement was performed.

### Pull requests and exact-head CI

- **PR #204** remains open and unmerged. Head: `b1c619f1368f63ef04497170f95bbc93b9185907`; comparison with `main`: 111 commits ahead, 0 behind. No submitted approval reviews or inline review threads were found. Exact-head CI passed: backend syntax run `41748390790`; backend tests run `41748390903` (240/240 passed); dependency audit run `41748390847` (npm audit reported 0 vulnerabilities); APK build run `41748390702` succeeded and uploaded artifact `pgnt-asian-topup-apk` (artifact ID `13284857622`, 25,561,722 bytes, expiry 2026-11-18T00:45:34Z). Uploaded artifact ZIP SHA-256: `79884689dbbcb010de732e370d4869de74d737d27245280a013f889b27c517f2`.
- **PR #206** remains open and Draft, based on PR #204. At this review it was 54 commits ahead of #204 and 0 behind. No submitted approval reviews or inline review threads were found.
- The previous #206 head `80e888d30063a7350c4ed840225693e3e2814b62` failed the backend test job because `tests/legacy-country-onboarding-lock.test.js` had seven malformed array closing delimiters, producing `SyntaxError: Unexpected token ')'` at line 32. This was a test-file syntax defect, not a runtime failure in the server. It was corrected in commit `874ded741649872ab3f4fe8d78c53b7a53d5d4ec` (`test: fix malformed legacy onboarding route boundary array`).
- On exact head `874ded741649872ab3f4fe8d78c53b7a53d5d4ec`, syntax run `41987289724` passed; backend tests run `41987289663` passed (264/264, 0 failures); dependency audit run `41987289669` passed with 0 vulnerabilities in both production-only and full dependency-tree audits. APK run `41987289668` had completed source preparation and Dart analysis, but its release-APK build step was still in progress when this record was written; no artifact is claimed for this run.
- The #206 syntax correction is committed. The CI and audit results above are attached to the exact source head; do not infer approval or merge readiness from green CI alone.

### 1. DT One countries, operators, products and provider mapping

- Local runtime country configuration confirms AF/AFN/+93, PK/PKR/+92, IN/INR/+91 and BD/BDT/+880. Migration 017 seeds provider country codes AFG, PAK, IND and BGD, but all four rows in `country_provider_mappings` are explicitly `pending`, while the country registry marks the four destinations `legacy`.
- The legacy-country lock intentionally prevents the new mapping/import workflow from silently changing these existing destinations. The read-only admin discovery code supports DT One country, operator and product discovery, including full product-detail checks. It verifies provider country and operator identity, product denomination currency, wholesale/retail currency units and fresh FX before a draft catalog can be previewed/imported.
- The migration source contains the explicit ATOMA Afghanistan sample products (100, 115, 250, 500 and 1,000 AFN; provider product IDs 7191, 7194, 7203, 7213 and 7233). They are seeded inactive. Product 7194 / ATOMA / 115 AFN is the isolated Stripe+DT One sandbox fixture; it is not an approval to activate it.
- **Not verified against the account's live DT One pre-production API in this run:** actual provider country-list matches, operator/network IDs, complete product lists and product-detail records for AFG/PAK/IND/BGD. The authenticated admin key and DT One pre-production credentials/dashboard were not available to this run, and the existing legacy mappings are pending rather than verified. Do not treat illustrative product-name matching tests as provider evidence.
- DT One's official DVS docs describe the asynchronous transaction endpoint, provider-generated transaction ID, customer `external_id`, callback updates and read-only status lookup by ID or `external_id`. DT One's examples distinguish non-final `SUBMITTED` from final `COMPLETED`, `REJECTED`, `CANCELLED` and `DECLINED`; the integration must continue to reconcile callbacks with status queries rather than treating HTTP acceptance as delivery. Account-specific product/operator availability still requires the authenticated sandbox catalog response.

### 2. Stripe + DT One sandbox payment, webhook, callback, failed top-up and refund

- Source review confirms the dedicated admin sandbox-checkout guard requires a Stripe `sk_test_` key, the exact DT One pre-production host and explicit `confirmSandbox: true`. It creates a EUR Checkout Session for the fixed ATOMA 115 AFN sandbox fixture and fixed pre-production recipient ending `100`; successful test payment can submit one DT One pre-production transaction. The product remains inactive.
- Stripe webhook code uses the raw request body and Stripe signature verification, claims webhook event IDs uniquely, re-fetches the canonical Checkout Session/PaymentIntent, checks EUR amount, succeeded status and test/live mode, and guards duplicate fulfillment. DT One callback code authenticates configured Basic credentials (or an explicitly configured shared-header secret), locks the order, checks local/provider references and status, and stores callback state transactionally. Ambiguous DT One outcomes go to `topup_review`, not blind resubmission.
- The refund route is admin-only and default-off unless `REFUNDS_ENABLED=true`; it requires a final DT One failure and a matching succeeded EUR PaymentIntent, reserves the refund uniquely before the Stripe request and uses an idempotency key. A provider failure does not automatically issue a refund.
- **Actual Stripe/DT One sandbox E2E was not run in this scheduled review.** The available CI suite uses source checks, mocks and an isolated local PostgreSQL integration test; it does not establish a live Stripe test Checkout, a real DT One pre-production callback, or a provider-confirmed declined/completed transaction. No test Checkout, provider transaction, or refund was created here because the authenticated sandbox/admin credentials were unavailable. This is still a release blocker.

### 3. Support acceptance

- The customer order-status endpoint requires the per-order access token and returns order/refund status without disclosing the refund reason. Support ticket creation and history are scoped to the same order token; the server stores a SHA-256 hash and compares it in constant time. Admin ticket inbox and ticket status/priority/reply updates retain `requireAdmin`.
- FAQ content is present in all six app languages. The CI suite includes support runtime mock-database tests, order-token isolation, admin middleware, refund/top-up category, FAQ localization and failed-top-up status tests; all are included in the 264/264 passing backend suite.
- **Operational escalation is only to the authenticated admin ticket inbox.** No email/push notification, assigned-agent alert, SLA timer or live-agent integration was verified. A refund-category ticket does not issue a refund; a refund remains a separate admin-reviewed Stripe action. No live customer ticket was created in this run.

### 4. Firebase SMS OTP security review

- `GlobalPhoneAuthGate.enabled` is `false`. Phone send/verify routes return HTTP 503 with `PHONE_AUTH_DEFERRED` and `smsSent: false`; no SMS can be sent by these backend routes while deferred.
- The backend Firebase middleware requires a Bearer ID token and Firebase Admin `verifyIdToken(token, true)`, checks UID/subject, audience, issuer, expiry and verified E.164 phone claim, and fails closed if project/service-account configuration is missing or mismatched. Tests cover missing/malformed, wrong-project, expired, revoked and phone-claim cases.
- **Rate limiting/abuse protection is not complete.** `rateLimitLockKeys` is only a helper; the phone-auth routes do not enforce phone/IP counters or persist events. Migration indexes for `phone_auth_events` exist, but the deferred route implementation does not use them. Before enabling OTP, implement atomic per-phone and per-IP quotas, cooldown/resend limits, monitoring/alerts and a lockout/recovery policy; configure Firebase SMS region policy and test with Firebase fictional numbers. Consider Firebase App Check/Play Integrity for protecting app-backed endpoints. Do not enable the gate or SMS provider yet.
- The Firebase Android API key in `firebase_options.dart` is a client configuration identifier, not the Admin service-account private key. Restrict the key to the correct Android package/APIs and register the final signing-certificate fingerprints in Firebase before release. No Firebase Console configuration was changed.

### 5. Android APK and physical-device acceptance

- The PR #204 exact-head APK build passed and produced the artifact recorded above. For PR #206, Dart analysis passed on head `874ded7`, but the release APK build was still running at audit time; verify its final job/artifact before using it.
- No physical Android device or ADB session was available to this run, so installation and device behavior are **not** marked passed. Use this acceptance sequence on the target Samsung/Android device after downloading the verified CI artifact:
  1. Download the APK only from the GitHub Actions artifact for the intended commit; compare its SHA-256 with the artifact/build record before opening it. Do not install an APK from an unknown mirror.
  2. Keep Google Play Protect enabled. If it blocks or warns, stop and inspect the package/signature and build provenance; do not disable Play Protect as a workaround. For a release candidate, prefer Play Console internal testing after signed AAB upload.
  3. If performing a controlled sideload test, grant “Install unknown apps” only to the file manager/browser used for this one install, install, then revoke that permission.
  4. Test clean install, first-launch welcome/language selection, all six languages, app relaunch and persistence, country/network/product/amount selection, phone validation, EUR quote/fee display, checkout cancel/return, transaction history/status refresh, failed/review/refund labels, support ticket create/history, network-offline/timeouts, back navigation and duplicate-tap protection.
  5. Confirm no OTP SMS is sent, no real payment/top-up is attempted, and no product activation occurs. Capture app version, Android version, device model, screenshots and sanitized logs for each failure. Then test upgrade from the previous installed build and verify that history/settings remain intact.
- The current APK workflow generates the Android project during CI, fixes application ID to `com.pgnt.asian.topup`, runs Dart analysis and builds an APK. It does not currently build an Android App Bundle or inject a dedicated release-upload keystore.

### 6. Play Store signing and Render deployment readiness

- `pubspec.yaml` remains version `1.0.0+1`. The APK workflow does not build `.aab`, configure a Play upload key, or prove Play App Signing enrollment. There is no committed Android Gradle signing configuration or key-properties file in this repository snapshot. Therefore the current APK artifact is a CI/device-test artifact, **not a verified Play Store release**. A signed AAB, protected upload-key secret, Play App Signing enrollment, version-code increment, internal testing track, store listing, privacy/data-safety declarations and policy review remain outstanding.
- `package.json` starts the service with `node migrate.js && node server.js`; migrations therefore run in the start command rather than a separately verified Render pre-deploy step. No `render.yaml` is present in the repository snapshot. Render dashboard settings, linked deploy branch, auto-deploy mode, environment variables, health-check path, backups and rollback behavior were not accessible to this review. The source health endpoint reports database/Stripe and separately reports webhook/DT One configuration, but its HTTP healthy predicate requires database plus Stripe only; it should not be treated as proof that the complete payment/top-up chain is ready.
- Before a controlled Render release, verify the linked branch and auto-deploy setting, use a reviewed pre-deploy migration command with backup/restore evidence, confirm all Stripe test/live and DT One pre-production/production credentials are paired correctly, verify webhook/callback URLs and secrets, and run an HTTP readiness check that fails when required webhook or DT One configuration is missing. No Render deployment, migration or environment change was performed.

### Acceptance outcome

- Automated CI on PR #206 head `874ded7`: syntax **PASS**, backend suite **264/264 PASS**, dependency audit **PASS / 0 vulnerabilities**; APK build **pending at audit time**.
- Task 1 provider mapping: **PARTIAL / BLOCKED on authenticated DT One catalog evidence**.
- Task 2 live sandbox E2E: **NOT RUN / BLOCKED on sandbox credentials and admin access**.
- Task 3 support code acceptance: **PASS for automated mock/source checks; PARTIAL operationally**.
- Task 4 Firebase security: **PARTIAL; fail-closed and token verification tests pass, rate limiting/abuse controls remain missing; SMS stays disabled**.
- Task 5 physical device acceptance: **NOT RUN; checklist supplied above**.
- Task 6 Play Store/Render readiness: **NOT READY; signing/AAB and Render dashboard/migration review remain outstanding**.

Estimated overall project completion remains **68%** (judgment estimate of implementation plus production readiness, not test coverage). The remaining 32% is concentrated in live provider evidence and sandbox E2E, missing rate limiting, operational support escalation, physical-device validation, signed AAB/Play Console and controlled Render deployment/backup readiness.
