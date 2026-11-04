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