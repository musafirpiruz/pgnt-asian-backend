# PGNT ASIAN TOPUP — Continuation Handoff
Last verified: 2026-11-18 (UTC; after adding bounded automatic operator catalog verification)
Repository: https://github.com/musafirpiruz/pgnt-asian-backend

## Working rule
Continue the existing Flutter + Node.js/Express project. Do not rebuild it. Keep changes on feature/integration branches until reviewed. Do not merge, deploy, run production migrations, activate countries/operators/products, initiate top-ups/payments/refunds, or enable calling without explicit owner approval.

## Current active work
- PR #249: https://github.com/musafirpiruz/pgnt-asian-backend/pull/249
- Branch: `feature/one-product-per-operator-auto-verification`
- Base: `integration/four-country-fx-dtone-reconciliation`
- Verified source head before documentation refresh: `22bab4194ca66575f32e34acbb5b195a8f680942`; latest docs head: `f4b90c024e3805247fad1a23e3f542fd7c82110d`
- PR state: open, Draft, unmerged; current API reports mergeable true, but do not merge without owner approval and base integration review.
- Latest CI on this exact head:
  - Backend Syntax Check run 44317732037: success.
  - Backend tests run 44317732067: success; regression test job and isolated PostgreSQL migration/integration steps completed.
- The latest test-only fix converts PostgreSQL bigserial product catalog IDs to numbers in the HTTP integration test payload, matching the API's strict integer validation.
- Passing CI is not production readiness.

## Implemented in PR #249
1. `catalog-auto-verification.js`: strict, fail-closed matching against authoritative DT One product detail: exact provider product ID, country, operator ID/name, currency, product type, denomination, positive EUR retail/wholesale prices, retail >= wholesale. Supports fixed/ranged recharge, fixed/ranged PIN, and ranged payment. Explicit ATOMA Afghanistan alias only; no fuzzy matching.
2. `country-definition.js`: data-driven country definition validation (ISO country/currency, calling code, phone digit range, provider mapping, language codes, duplicate prevention). Synthetic Ghana fixture is only a validator test, not proof of provider coverage.
3. `migrations/024_country_provider_approval_audit.sql`: sample approval and audit tables. One current sample approval per operator; revoked history retained. Activation remains separate.
4. `server.js` admin endpoints:
   - GET `/api/admin/country-operators/:operatorId/catalog-candidates`
   - POST `/api/admin/country-operators/:operatorId/approve-sample` (requires `confirmApproval: true`)
   - POST `/api/admin/country-operators/:operatorId/catalog-batch-preview` (requires `dryRun: true`; max 25 unique product catalog IDs)
   Sample approval fetches exact DT One product detail, applies strict evaluator, stores approval/audit/price evidence. Batch preview fetches and evaluates exact provider details for the selected operator's candidates and persists preview audit outcomes. Both keep operator, mapping and product activation flags unchanged/false and create no payment/top-up/transaction.
5. `migrate.js` includes migration 024 after 022 and 023.
6. PostgreSQL-backed HTTP route integration tests cover safe sample approval, batch preview, and failure/rollback behavior; source-level safety contract tests remain too.

## Critical owner requirement — one sample per operator
For each mobile network/operator, the owner manually approves only ONE representative product. After that, the system automatically verifies the remaining products belonging to that same network/operator. Do not require manual approval for every product.

Implemented in the current PR branch:
- Authenticated POST `/api/admin/country-operators/:operatorId/catalog-auto-verify`.
- Requires exactly one current owner-approved sample; the sample's provider operator ID is the exact identity anchor.
- Processes up to 25 remaining inactive, unverified products per page, using each exact DT One provider product ID.
- Checks exact product ID, country, operator name and exact provider operator ID, currency, supported product type, denomination, and explicit EUR retail/wholesale price units.
- Matching candidates receive technical mapping verification timestamps and updated EUR price evidence. Mismatches/provider failures are audited as rejected/review outcomes.
- Returns a product-catalog cursor for the next page; callers can continue until no more candidates remain.
- Verification does not activate countries/operators/products/mappings and creates no payment/order/top-up transaction.
- PostgreSQL-backed HTTP test covers second-product automatic verification without a second owner action, provider operator ID mismatch rejection despite matching display name, authentication, and missing sample approval.

Remaining: admin UI must drive the bounded pages and present exceptions; add deeper tests for pagination, provider 404/5xx/timeout, concurrent state changes, and retry behavior. Do not describe the full operator catalog as complete until these and the UI are validated.

## Important limitations / next engineering steps
- Admin authentication currently uses shared `ADMIN_API_KEY`; actor is recorded as `shared_admin_api_key`. Per-admin accounts/RBAC and individual identity audit remain outstanding.
- Check product type/range handling against live DT One product detail schemas before using beyond supported products.
- Verify DT One wholesale prices in EUR; never substitute reference FX rates.
- Public API should expose only active/verified operators and mappings; quote and checkout must use the same unique verified resolver.
- Current batch preview is dry-run only; it does not activate products and is not the full automatic-after-sample workflow.

## Canonical country registry (PR #225 dependency)
PR #225: https://github.com/musafirpiruz/pgnt-asian-backend/pull/225
Branch `integration/four-country-fx-dtone-reconciliation`, base `main`, Draft/unmerged at last review. It provides canonical registry and seeds AF/PK/IN/BD from current catalog, with provider IDs null and all new activation flags false. PR #249 is based on this integration branch. Do not merge PR #249 into main independently of its base integration plan.

## Product/catalog facts
- Master workbook has 1,960 candidate rows: Afghanistan 542, Pakistan 783, India 147, Bangladesh 488.
- Workbook is not proof of live DT One availability, correct provider IDs, or current wholesale pricing.
- Never infer provider IDs from names or fuzzy matching.
- Imported products stay disabled until verified and separately approved for activation.
- Production DB snapshot on 2026-11-18 had no canonical registry tables; only legacy migrations 002–016 were applied. Production migration/deploy was not performed.
- Historical FX reference values AFN/EUR 72.8325, BDT/EUR 138.6300, INR/EUR 106.4700, PKR/EUR 310.7630 are reference data only, not DT One wholesale rates.

## Full product scope
- Countries: Afghanistan, Pakistan, India, Bangladesh; extensible to future countries by data/configuration, not country-specific code branches.
- Languages: English, Pashto, Dari, Urdu, Hindi, Bengali.
- Payments in EUR using Stripe; destination currencies AFN, PKR, INR, BDT; DT One top-ups.
- Wallet, transaction history, admin pricing/fees/FX, support/refund review, admin panel, referral system.
- Referral reward is fixed €0.07 after the referred user's first successful payment, admin-controlled, server-side validation, anti-fraud, and ledger.
- International calling is explicitly part of the master project plan and must be included in overall progress estimates: international mobile numbers only (no landlines). Not implemented. Future work must include E.164 validation, country/provider coverage and live tariffs, wallet reservation and ledger, call-detail-record reconciliation, fraud controls, and regulatory review. Do not claim calling is available.
- Keep Stripe/DT One sandbox and production isolated. No real charge/refund/top-up without explicit approval.

## Next steps in order
1. Keep PR #249 Draft and unmerged; verify CI on the exact latest head before any merge discussion.
2. Finish automatic verification hardening: pagination, provider 404/5xx/timeout, concurrent catalog changes, audit persistence rollback, idempotent retries, and exact operator scope.
3. Add/update admin UI to trigger the automatic pages and show verified/review/rejected/inactive counts without asking for per-product owner approvals.
4. Update PR #249 and issue #248 with test evidence and remaining limitations.
5. Review PR #225/#249 dependency and mergeability before any future merge; require explicit approval.
6. Separately plan country/network price verification for all four markets.
7. Plan international calling as a separate provider integration and compliance workstream.
8. Only after reviewed tests and owner approval: staging migration/deploy, read-only verification, then separately approved production rollout.

## Current truthful status
The automatic operator-scoped verification endpoint and PostgreSQL-backed integration coverage have been added on PR #249. Backend Syntax Check and Backend tests passed on commit `393104d8c4dd438e97a2d665205693180d32be04` (CI runs 44318451160 and 44318451091). A later small server correction and authentication/no-sample test plus documentation updates advanced the branch to `f4b90c024e3805247fad1a23e3f542fd7c82110d`; CI for that exact latest head must be checked before calling it validated. PR #249 remains open, Draft, and unmerged. Automatic verification is bounded to pages of up to 25; no activation, payment, refund, order, or DT One top-up is performed. Production migrations/deploy were not performed. International calling remains planned, not implemented.
