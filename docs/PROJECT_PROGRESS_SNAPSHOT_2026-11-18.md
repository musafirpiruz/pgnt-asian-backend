# PGNT ASIAN TOPUP — Project Progress Snapshot (2026-11-18)

## Overall estimate

**Estimated project completion: 55%** (rounded from a weighted planning estimate of 54.5%).

This is a planning estimate, not a line-of-code metric, automated coverage score, or production-readiness certification. It includes the requested international mobile-calling feature in the total scope. Work is counted as complete only to the extent supported by the current repository/workbook review; sandbox foundations and offline catalog data are not counted as production validation.

## Weighted workstream estimate

| Workstream | Weight | Estimated completion | Evidence / remaining work |
|---|---:|---:|---|
| Flutter app and customer UX | 15% | 65% | Existing app and screens are present; full end-to-end UX, device/network checks and release validation remain. |
| Backend foundation, database and APIs | 15% | 80% | Node/Express backend, PostgreSQL migrations and core APIs exist; production hardening and full regression validation remain. |
| Stripe payments, webhooks and refunds | 12% | 65% | Stripe integration and guarded refund workflow exist; production-mode end-to-end reconciliation and operational checks remain. |
| DT One integration and callbacks | 12% | 50% | Sandbox integration and product-detail verification workflow exist; live provider credentials, callbacks and country/operator validation remain. |
| Four-country catalog and product coverage | 12% | 35% | 1,960-row offline workbook audited; 17 sample candidates prepared; no live DT One validation of all four-country products yet. |
| Pricing, FX, fees and currencies | 8% | 55% | EUR pricing/fee foundations exist; all four destination-country rates, provider costs and customer prices need verified reconciliation. |
| Admin Panel and access security | 8% | 55% | Catalog approval/verification UI and APIs exist; per-admin identities/RBAC and staging validation remain (shared admin API key currently used). |
| Referral and wallet ledger | 6% | 65% | Referral reservation/idempotency and fixed-reward direction exist; full app/admin lifecycle and production abuse testing remain. |
| Automated support and refund review | 5% | 25% | Some order review/refund foundations exist; transaction-status automation, FAQ and human escalation are incomplete. |
| International mobile calling | 3% | 0% | In scope: international mobile numbers only, no landlines. Provider, tariffs, E.164 validation, wallet/ledger, CDR and compliance work not implemented. |
| QA, production deployment and Play Store | 4% | 20% | CI and isolated DB tests exist; complete current-head green CI, staging, production verification, APK/release and Play Store work remain. |

## Current catalog milestone

- Master workbook: 1,960 rows, 1,960 unique Product IDs in All_Products.
- Offline amount-policy review: 1,689 integer fixed-recharge denominations in the 75–3,000 inclusive range; 17 decimal AFN denominations remain review-only.
- Candidate sample register: 17 standard mobile operator labels (5 Afghanistan, 5 Bangladesh, 3 India, 4 Pakistan).
- The sample register is a proposal for owner review, not a DT One provider approval.
- Auto-verification code uses a single approved sample per operator, bounded pages of up to 25, persisted cursor/audit and exact provider operator identity checks.
- Integration tests include provider 404, 503, timeout, identity mismatch, stale cursor, retry queue and activation/transaction safety checks.

## Current repository / CI state

- PR #249 is open, Draft and unmerged.
- Current head at time of this snapshot: c3711d2ece196713aac5efcd6c0b9a5a17f59547.
- Backend regression tests are still in progress on that head.
- Backend Syntax Check is queued on that head.
- No production deployment, production migration, product activation, payment, refund, or top-up was performed by this progress review.

## Main remaining gates before launch

1. Obtain owner approval for the representative sample of each operator.
2. Verify exact DT One Product IDs, provider operator IDs, country, currency, type, denominations and EUR wholesale/retail prices.
3. Reconcile four-country FX, provider costs, fees and final customer prices.
4. Complete per-admin RBAC and staging validation.
5. Finish support automation and international mobile calling (mobile-only).
6. Get all current-head CI checks green, then perform staging and production verification.
7. Build and validate the release APK and complete Play Store readiness.

The 55% estimate should be revised as each gate is evidenced. A sandbox test, offline workbook row, or technical code path must not be treated as proof that a production service is ready.
