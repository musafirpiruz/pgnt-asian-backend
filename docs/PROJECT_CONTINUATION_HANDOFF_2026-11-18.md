# PGNT ASIAN TOPUP — Continuation Handoff
Last verified: 2026-11-18 (UTC; after PR #249 CI run 44317732067)
Repository: https://github.com/musafirpiruz/pgnt-asian-backend

## Working rule
Continue the existing Flutter + Node.js/Express project. Do not rebuild it. Keep changes on feature/integration branches until reviewed. Do not merge, deploy, run production migrations, activate countries/operators/products, initiate top-ups/payments/refunds, or enable calling without explicit owner approval.

## Current active work
- PR #249: https://github.com/musafirpiruz/pgnt-asian-backend/pull/249
- Branch: `feature/one-product-per-operator-auto-verification`
- Base: `integration/four-country-fx-dtone-reconciliation`
- Verified head: `502d9f492c79e33b73f7c1fc6b69913a0b534e3d`
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
For each mobile network/operator, the owner manually approves only ONE representative product. After that, the system must automatically verify the remaining products belonging to that same network/operator. Do not require manual approval for every product.
- The current PR implements manual sample approval and a bounded dry-run batch preview.
- It does NOT yet automatically launch/complete verification of every remaining operator product after sample approval.
- Next implementation: operator-scoped, bounded/paginated automatic verification after sample approval, using the approved sample as the operator reference and exact DT One product detail for every candidate. Compare exact provider product ID, country, operator ID/name, currency, product type, denomination, and EUR retail/wholesale prices.
- Matching candidates may become technically verified with persisted evidence/audit; mismatches, ambiguous results, provider errors/timeouts must go to review/rejected and never be guessed.
- Technical verification must remain separate from activation. Never auto-activate products/operators/mappings. Keep a safe batch/page limit (maximum 25 per request) and revalidate state under DB locks.

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
1. Keep PR #249 Draft and unmerged; recheck branch head and CI before every edit.
2. Implement automatic operator-scoped catalog verification triggered/available after the one manual sample approval; bounded pages (<=25), exact provider lookups, strict fail-closed evaluator, durable audit evidence, explicit mismatch/provider-error review states.
3. Add PostgreSQL-backed tests for automatic verification: approved sample required, exact operator scope, pagination/limits, provider 404/5xx/timeout, match/mismatch, concurrent changes, audit persistence rollback, idempotency, and no activation/payment/top-up.
4. Update PR #249 and issue #248 with evidence and limitations.
5. Review PR #225/#249 dependency and mergeability before any future merge; require explicit approval.
6. Separately plan country/network price verification for all four markets.
7. Plan international calling as a separate provider integration and compliance workstream.
8. Only after reviewed tests and owner approval: staging migration/deploy, read-only verification, then separately approved production rollout.

## Current truthful status
Latest PR #249 head `502d9f492c79e33b73f7c1fc6b69913a0b534e3d` passed Backend Syntax Check run `44317732037` and Backend tests run `44317732067`. The PostgreSQL-backed admin route integration test job passed after correcting string IDs to numeric IDs in the test request. PR #249 remains open, Draft, and unmerged. Manual one-sample-per-operator approval and dry-run batch preview exist; the full automatic verification of remaining products after sample approval is still outstanding. No production migrations, deploy, product activation, payment, refund, or DT One top-up was performed. International calling remains planned, not implemented.
