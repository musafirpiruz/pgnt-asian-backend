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
