# PGNT ASIAN TOPUP — Continuation Handoff
Last verified: 2026-11-18 (UTC; updated after PR #249 CI run 44311686082)
Repository: https://github.com/musafirpiruz/pgnt-asian-backend

## Working rule
Continue the existing Flutter + Node.js/Express project. Do not rebuild it. Keep changes on feature/integration branches until reviewed. Do not merge, deploy, run production migrations, activate countries/operators/products, initiate top-ups/payments/refunds, or enable calling without explicit owner approval.

## Current active work
- PR #249: https://github.com/musafirpiruz/pgnt-asian-backend/pull/249
- Branch: `feature/one-product-per-operator-auto-verification`
- Base: `integration/four-country-fx-dtone-reconciliation`
- Verified head: `5950f84114d7c6e67cead451ad0632406a4dbfa2`
- PR state: open, Draft, unmerged.
- Latest CI on that exact head:
  - Backend tests run 44311686082: success.
  - Backend Syntax Check run 44311686058: success.
- PR #249 is not merged. Do not mistake passing CI for production readiness.

## Implemented in PR #249
1. `catalog-auto-verification.js`: strict, fail-closed matching against authoritative DT One product detail:
   exact provider product ID, country, operator ID/name, currency, product type, denomination, positive EUR retail/wholesale prices, retail >= wholesale. Supports fixed/ranged recharge, fixed/ranged PIN, and ranged payment. Explicit ATOMA Afghanistan alias only; no fuzzy matching.
2. `country-definition.js`: data-driven country definition validation (ISO country/currency, calling code, phone digit range, provider mapping, language codes, duplicate prevention). Synthetic Ghana fixture is only a validator test, not proof of provider coverage.
3. `migrations/024_country_provider_approval_audit.sql`: sample approval and audit tables. One current sample approval per operator; revoked history retained. Activation remains separate.
4. `server.js` admin endpoints:
   - GET `/api/admin/country-operators/:operatorId/catalog-candidates`
   - POST `/api/admin/country-operators/:operatorId/approve-sample` (requires `confirmApproval: true`)
   Approval fetches exact DT One product detail, applies strict evaluator, records approval/audit and EUR price evidence. It deliberately leaves operator, mapping and product active flags false and creates no payment/top-up/transaction.
5. `migrate.js` includes migration 024 after 022 and 023.

## Important limitations / next engineering steps
- Added `tests/country-operator-admin-approval-contract.test.js` for source-level safety contracts (authenticated/read-only candidate route, explicit confirmation, provider detail lookup, transaction/audit markers, and activation invariants). This is not an HTTP route-level PostgreSQL integration test.
- Route-level PostgreSQL integration tests for the new admin endpoints are still required. Existing evaluator tests and migration tests do not fully exercise HTTP authorization, provider failures, transaction rollback, duplicate approval, and all DB writes.
- Admin authentication currently uses shared `ADMIN_API_KEY`; actor is recorded as `shared_admin_api_key`. Per-admin accounts/RBAC and individual identity audit remain outstanding.
- The DB connection failure path was hardened in commit `5950f84114d7c6e67cead451ad0632406a4dbfa2`: rollback is guarded when no client was acquired; `finally` only releases an acquired client. Add defensive route-level transaction tests.
- Add bounded catalog batch preview/apply only after sample approval is tested: operator-specific, maximum 25 records per batch, dry-run first, explicit confirmApply, exact provider IDs and strict evaluator, persisted audit evidence, no activation. Never bulk-process/activate the 1,960-row workbook.
- Check product type/range handling against live DT One product detail schemas before using beyond fixed-value recharge.
- Verify DT One wholesale prices in EUR; never substitute reference FX rates.
- Public API should expose only active/verified operators and mappings; quote and checkout must use the same unique verified resolver.

## Canonical country registry (PR #225 dependency)
PR #225: https://github.com/musafirpiruz/pgnt-asian-backend/pull/225
Branch `integration/four-country-fx-dtone-reconciliation`, base `main`, Draft/unmerged at last review. It provides canonical registry and seeds AF/PK/IN/BD from current catalog, with provider IDs null and all new activation flags false. PR #249 is based on its head. Do not merge PR #249 into main independently of its base integration plan.

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
1. Keep PR #249 Draft. Recheck current CI and branch head before further edits.
2. Add route-level tests for the two admin endpoints with isolated PostgreSQL and mocked DT One responses.
3. Test unauthorized access, missing confirmation, invalid IDs, provider 404/5xx/timeout, exact match, mismatch, duplicate approval, active rows, and rollback. Assert no activation and no transaction.
4. Add operator-scoped dry-run catalog batch preview (<=25) only after tests pass; no automatic activation.
5. Update PR #249 and issue #248 with test evidence.
6. Review PR #225/#249 dependency and mergeability before any future merge; require explicit approval.
7. Separately plan country/network price verification for all four markets.
8. Plan international calling as a separate provider integration and compliance workstream.
9. Only after reviewed tests and owner approval: staging migration/deploy, read-only verification, then separately approved production rollout.

## Current truthful status
Latest PR #249 head `5950f84114d7c6e67cead451ad0632406a4dbfa2` passed Backend tests run `44311686082` and Syntax Check run `44311686058`. Source-level admin approval safety contract tests are present and the DB connection failure path is guarded. HTTP route-level PostgreSQL integration tests remain outstanding. Issue #248 was updated in comment `6979758655` with this exact evidence and limitations. No production migrations, deploy, product activation, payment, refund, or DT One top-up was performed. International calling remains planned, not implemented.
