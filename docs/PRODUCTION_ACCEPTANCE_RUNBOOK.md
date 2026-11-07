# PGNT ASIAN TOPUP — Release Acceptance Runbook

This runbook is an operational checklist, not authorization to move customer money or deploy to Production. Execute first against isolated staging/sandbox systems. Record evidence (run IDs, timestamps, sanitized logs, screenshots) without storing secrets or personal data in GitHub.

## 1. Environment and safety gates

- [ ] Confirm the target is staging and uses a separate database, Stripe test keys, and DT One sandbox credentials.
- [ ] Confirm Production secrets are not present in staging and sandbox credentials are not present in Production.
- [ ] Confirm Firebase SMS OTP, real Stripe charges/refunds, DT One live top-ups, new-country activation, and Production deployment remain disabled.
- [ ] Confirm admin routes require the configured admin authentication and customer routes do not expose admin diagnostics.
- [ ] Confirm no secrets, full phone numbers, payment credentials, or access tokens appear in logs or test artifacts.

## 2. Database backup and restore rehearsal

Perform this only on an isolated staging database with an authorized operator.

1. Record the database engine/version, migration head, and approximate database size.
2. Take a provider-supported consistent backup (or a PostgreSQL custom-format dump where appropriate). Store it in the approved encrypted backup location, not in the repository.
3. Record backup timestamp, checksum, retention/expiry, and operator.
4. Restore into a newly created isolated database. Never restore over the source database.
5. Run the complete migration chain against a clean disposable database and separately verify an upgrade from the previous schema version.
6. Compare row counts and key invariants for users, orders, payment records, refunds, product catalog, pricing settings, referral records, support tickets, and wallet-related records.
7. Run read-only reconciliation and application smoke tests against the restored database.
8. Record restore duration, errors, and evidence. A successful backup without a successful restore is not a passed gate.

**Pass condition:** the restore is usable, expected records and relationships are preserved, migrations are repeatable, and the evidence is reviewed by someone other than the operator.

## 3. Country onboarding and catalog

- [ ] Keep the four legacy countries available through the compatibility path.
- [ ] For a new country, discover currency candidates and select the destination currency explicitly; record source and confirmation.
- [ ] Verify the DT One country mapping against the provider's read-only response.
- [ ] Discover the complete product list; confirm pagination is not truncated.
- [ ] Verify each product detail against the listed product/operator/country identity.
- [ ] Confirm destination denomination currency and wholesale/retail settlement currency independently.
- [ ] Confirm FX source, observation date, expiry, and conversion to EUR. Reject stale or unsupported rates.
- [ ] Import products disabled. Review operator identity, denomination, EUR cost, fees, and final customer price before any activation.
- [ ] Complete country, operator, and product localizations in en, ps, fa, ur, hi, bn.
- [ ] Run preflight and resolve every failed check. Activation is a separate explicit admin action and is not part of this rehearsal.

## 4. Customer order and provider callback sandbox tests

Use test numbers and provider-approved sandbox products only.

- [ ] Quote a product and verify country, operator, denomination, destination currency, EUR price, app fee, and estimated Stripe fee.
- [ ] Reject tampered product IDs, country/operator mismatches, unsupported amounts, invalid phone numbers, and stale quotes.
- [ ] Complete a Stripe Test Mode payment and verify the signed webhook, raw-body signature validation, idempotency, and canonical paid status.
- [ ] Verify fulfillment is created once only after the required paid state.
- [ ] Deliver duplicate and out-of-order DT One callbacks; confirm idempotent status transitions.
- [ ] Reconcile a submitted transaction using a read-only provider lookup before considering any retry.
- [ ] Verify failed, pending, completed, and ambiguous outcomes separately. Never retry an ambiguous provider transaction automatically.
- [ ] Confirm order history is scoped to the authenticated order access token and does not reveal another customer's order.

## 5. Refund acceptance — Stripe Test Mode only

- [ ] Verify refund is blocked unless payment is canonically paid and the provider fulfillment outcome meets the refund policy.
- [ ] Verify exact EUR amount and PaymentIntent association.
- [ ] Verify Stripe idempotency key and duplicate/concurrent refund protection.
- [ ] Exercise succeeded, pending, rejected, timeout/unknown, and webhook-replay scenarios.
- [ ] Confirm only a succeeded full refund becomes refunded; ambiguous outcomes remain in manual review.
- [ ] Reconcile Stripe and local refund state. Do not use live customer payment methods.

## 6. Wallet and referral gates

**Wallet:** do not enable customer wallet writes until there is an append-only ledger, stable authenticated user identity, atomic balance posting, idempotency, row locking/serialization, non-negative balance enforcement, reversal entries, reconciliation, audit logging, and concurrency/failure tests. Read-only diagnostics are not proof that a wallet is implemented.

**Referral:** keep rewards disabled until server-side invitation validation, duplicate/fraud controls, first-successful-payment eligibility, fixed EUR 0.07 reward accounting, and a traceable reward ledger have end-to-end tests. Do not rely on client-side install claims.

## 7. Support acceptance

- [ ] Verify ticket creation requires a valid order access token and is scoped to that order.
- [ ] Verify cross-order token use is rejected.
- [ ] Verify admin ticket listing, status/priority changes, and replies require admin authentication.
- [ ] Verify the six localized FAQ sets are complete and do not promise refunds or top-ups before verified status.
- [ ] Treat static localized FAQs as guidance only; do not describe them as an automated backend responder.
- [ ] Verify escalation and customer-visible ticket history in staging.

## 8. Android and store acceptance

- [ ] Install the signed release APK on physical Android devices (not only an emulator).
- [ ] Test first launch, six-language welcome selection, login persistence, country/operator/amount selection, checkout return, order history, and support.
- [ ] Verify the app does not expose test controls or secrets in release builds.
- [ ] Confirm application ID, signing key custody, versionCode/versionName, Play App Signing, privacy policy, Data Safety declarations, permissions, and target SDK.
- [ ] Complete Play Console internal testing before production rollout.

## 9. Independent review and release decision

- [ ] Independent reviewer examines migrations, payment/refund gates, provider callbacks, country activation, pricing/FX, authentication, logging, and Flutter selection.
- [ ] All CI workflows pass on the exact candidate commit.
- [ ] Database backup and restore rehearsal passes with evidence.
- [ ] Stripe and DT One sandbox acceptance passes.
- [ ] Physical Android install and store compliance checks pass.
- [ ] No unresolved critical/high security findings.
- [ ] Rollback procedure and monitoring/alert ownership are documented.
- [ ] Obtain explicit written Production approval from the project owner before any live deployment or real-money operation.

## Evidence record

Record for each run: candidate commit SHA, environment name, workflow/run URL, database migration head, backup/restore evidence location, Stripe test event IDs, DT One sandbox transaction IDs, Android device/build details, reviewer, date, pass/fail, and follow-up issue. Redact secrets, tokens, customer names, and full phone numbers.

## Current known release blockers

- Independent human review of PR #204.
- Production-like database backup and restore rehearsal.
- End-to-end Stripe Test Mode refund acceptance.
- Physical Android install and Play Store checks.
- Wallet ledger implementation and automated backend FAQ response are separate unfinished features; this runbook does not imply they are complete.
