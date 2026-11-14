# PGNT ASIAN TOPUP — Project Continuation Checkpoint

Last updated: 2026-11-14
Repository: musafirpiruz/pgnt-asian-backend
Active PR: https://github.com/musafirpiruz/pgnt-asian-backend/pull/242
Branch: feat/customer-ranged-catalog-2026-11-13
Current head commit: 47589cbc4989896ed371825e02600be13cc89547

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
