# DT One Ranged Checkout — Integration Design

Status: implementation design only. This document does not activate products, run migrations, create payments, or call DT One.

## Existing verified foundation

- `dtone_ranged_products` is a separate provider catalog; products default to inactive.
- `dtone_product_capabilities` records provider product type, calculation mode, bounds, increment, and verification evidence.
- `dtone_ranged_transactions` stores one provider transaction per order, quote evidence, EUR wholesale evidence, and the provider confirmation deadline.
- `dtone-ranged-pricing.js` validates CREATED quote identity and EUR wholesale price, computes a EUR customer charge including app and estimated Stripe fees, builds a DESTINATION_AMOUNT request with `auto_confirm:false`, and verifies the CONFIRMED response.
- Current fixed checkout remains the only live runtime checkout path. It expects an internal `product_catalog.id` in `orders.product_id`; the ranged catalog uses a DT One provider product ID and must not be confused with that internal ID.

## Required runtime sequence

1. Validate the requested country, destination phone, active ranged product, exact provider capability, amount bounds, increment, and `DESTINATION_AMOUNT` support on the server.
2. Create a unique order ID and request a DT One asynchronous transaction with `auto_confirm:false`. Do not accept a client-supplied price, provider ID, wholesale cost, or FX rate.
3. Verify the response is `CREATED`, matches the exact order external ID, DT One product ID, destination amount/currency, and contains an unexpired confirmation deadline.
4. Require explicit EUR wholesale amount and fee evidence. If DT One returns another currency or incomplete evidence, stop and mark for review; do not guess an FX conversion.
5. Read admin-controlled country/operator fee and Stripe fee settings, calculate the gross EUR cents price, and persist the order and ranged transaction ledger atomically.
6. Create a Stripe Checkout Session in EUR using an idempotency key; persist the exact Stripe session ID before returning the checkout URL.
7. In the Stripe webhook, re-fetch the canonical paid Checkout Session, verify EUR amount, payment intent, livemode, saved session ID, and order status exactly as the fixed flow does.
8. For a ranged order only, lock the corresponding ranged ledger row, require provider state `CREATED`, verify its identities and that `confirm_by` has not expired, then call the provider confirmation endpoint exactly once.
9. Verify the response is `CONFIRMED` for the same transaction, order external ID, and provider product. Persist the provider status and confirmation timestamp. Any timeout, expired quote, identity mismatch, or ambiguous provider response must move the order to review; never blindly recreate or reconfirm a transaction.
10. Keep the existing fixed-product fulfillment path unchanged. Add mocked tests for both branches, duplicate webhooks, expired quotes, provider timeout, mismatched IDs, and no accidental fixed-product submission for ranged orders.

## Database compatibility gate

The existing `orders.product_id` is `NOT NULL` and identifies an internal fixed-catalog row. Before runtime integration, add an additive, versioned schema change that explicitly distinguishes fixed and ranged fulfillment and safely stores the ranged provider product identity. Do not place a DT One provider product ID into `orders.product_id`, and do not use a fabricated fixed-product ID.

The migration must be covered by schema tests and remain unapplied until separately reviewed. Runtime code must fail closed if the required schema version/columns are unavailable.

## Release gates

- Backend syntax and full test suite pass on the exact PR head.
- APK build passes on the same head.
- No provider product is activated merely by importing or discovering it.
- Sandbox tests use explicit test credentials and a test recipient only.
- No production migration, deployment, real payment, real top-up, or PR merge without separate approval.
