# Firebase Phone Authentication — final-phase implementation runbook

Status: **backend token-verification core implemented in PR #188; Firebase client setup and production configuration remain pending; phone sign-in/SMS remain disabled**.

## Product decision

- Firebase Authentication Phone is the only planned SMS/OTP provider.
- Do not add Twilio, a paid SMS gateway, or a backend endpoint that sends SMS itself.
- SMS integration is deliberately deferred until the final release phase.
- Until that phase is explicitly approved and completed, the existing phone-auth endpoints must continue returning HTTP 503 with `PHONE_AUTH_DEFERRED` and `smsSent: false`.

## Target architecture

1. The Flutter app initializes Firebase using the project's Android Firebase configuration.
2. The customer starts phone sign-in through the Firebase Flutter Authentication SDK. Firebase owns OTP delivery, verification, resend behavior, and its provider quotas/anti-abuse controls.
3. After successful Firebase sign-in, Flutter obtains a fresh Firebase ID token and sends it to the backend as `Authorization: Bearer <ID_TOKEN>`.
4. The backend verifies the ID token with the Firebase Admin SDK. It must validate signature, issuer, audience/project ID, expiry, and revocation; reject missing, malformed, expired, or revoked tokens.
5. The backend derives the customer identity from the verified token's immutable Firebase `uid`. It must not trust a UID, phone number, install ID, referral code owner, or customer ID supplied in the request body.
6. If a phone number is required, use only the verified token's `phone_number` claim and validate it as E.164. Do not use a user-entered phone number as proof of ownership.
7. Logout is performed by the Firebase client SDK. A backend logout endpoint must not pretend to revoke a token unless it actually performs and verifies a server-side revocation operation.

## Referral attribution requirements

Referral attribution must remain unavailable until Firebase token verification is implemented and tested.

- Accept referral attribution only after a valid Firebase ID token is verified server-side.
- Issue a short-lived, server-signed attribution token bound to the verified Firebase UID and campaign/code, with expiry and one-time-use semantics.
- Enforce one eligible attribution per verified UID in the database with a unique constraint and transaction/row locking.
- The client must never generate or submit an install hash as identity proof.
- Reward is fixed at **7 EUR cents (€0.07)** and becomes eligible only after the customer's first successfully completed paid top-up.
- Duplicate callbacks, concurrent requests, refunds, and retries must not create duplicate rewards.
- A reward marked paid requires an auditable external payout reference and immutable ledger evidence. A status toggle alone is not proof of payment.
- Campaigns and codes remain inactive by default. Do not enable payout or activation controls as part of the authentication work.

## Secrets and configuration

- Never commit Firebase service-account JSON, private keys, API secrets, or tokens.
- Store any server-side Firebase Admin credential only in the hosting provider's encrypted secret/environment settings. Do not send credentials in chat or add them to GitHub.
- Keep the Firebase project ID explicit and verify that token audience matches it.
- Use separate Firebase projects for development/staging and production where possible.
- The Flutter Firebase configuration files identify the project but do not replace server-side ID-token verification.

## Required implementation and verification checklist

### Flutter
- [ ] Confirm the Android application ID/package name and Firebase project match.
- [ ] Add and initialize `firebase_core` and `firebase_auth` only in the approved final phase.
- [ ] Configure Android signing SHA-1/SHA-256 fingerprints in Firebase.
- [ ] Handle verification-in-progress, automatic verification, code sent, timeout, invalid code, quota exceeded, and network errors.
- [ ] Keep OTP and phone-number values out of analytics and logs.
- [ ] Do not create a custom SMS sender or store OTP codes locally.

### Backend
- [x] Add Firebase Admin SDK `13.10.0`, pinned for the repository's Node.js 20 runtime (Firebase Admin v14 requires Node.js 22+).
- [x] Implement a reusable bearer-token middleware using `verifyIdToken(token, true)`.
- [x] Fail closed if Firebase project ID or server credentials are missing; validate the service-account project matches `FIREBASE_PROJECT_ID`.
- [x] Protect `GET /api/auth/me` with verified Firebase identity and verified E.164 phone claim.
- [ ] Configure `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_JSON` as protected hosting environment variables; never commit credentials.
- [x] The protected `/api/auth/me` route derives its returned customer identity only from the verified `uid`; other customer-private routes still require integration.
- [ ] Require verified identity for referral attribution and customer-private endpoints.
- [ ] Keep admin authorization separate from customer Firebase authentication.
- [x] Firebase middleware returns safe error codes without exposing token contents, phone numbers, or credential details.

### Tests
- [x] Unit-test missing, malformed, expired, revoked, wrong-project, and valid tokens.
- [x] Test Firebase Admin credential parsing, project mismatch, missing configuration, and verified `/api/auth/me` identity.
- [x] Test missing/invalid E.164 phone claims where phone is required.
- [x] Test that client-supplied UID, phone, or install ID cannot override verified claims on the authenticated identity path; referral owner enforcement remains pending.
- [ ] Test referral uniqueness, expiry, one-time use, concurrency, duplicate webhook, first-paid-top-up, and refund cases.
- [ ] Run Firebase Auth Emulator integration tests; do not send real SMS in CI.
- [x] Verify existing deferred-auth tests continue passing; SMS endpoints remain HTTP 503 with `smsSent: false`.

### Release gate
- [ ] Confirm Firebase project/provider settings and app identifiers.
- [ ] Configure hosting secrets directly in the hosting dashboard; never expose them in chat.
- [ ] Complete emulator and staging tests before any production SMS.
- [ ] Obtain explicit approval before enabling OTP delivery, referral activation, wallet writes, payments, refunds, or live top-ups.

## Latest CI evidence (2026-11-01)

- Backend Syntax Check: passed for commit `1a9a17bc3a92713449d4b402d625b66d05298ec6`.
- Backend tests, including isolated PostgreSQL migration/regression checks: passed for the same commit.
- Dependency Security Audit (diagnostic workflow): completed successfully for the same commit. This is a diagnostic audit, not a guarantee that all runtime or production risks are eliminated.
- The checks validate the repository branch only; they do not prove that Firebase/Render production configuration exists or that a production deployment is healthy.

## Current safe state

The backend token-verification adapter is implemented on the PR #188 branch, but Firebase remains unconfigured until the owner creates/configures the Firebase project and adds the protected Render environment variables. `POST /api/auth/phone/send` and `/verify` intentionally continue returning HTTP 503 with `smsSent: false`; OTP delivery is not enabled. Flutter `firebase_core`/`firebase_auth`, Android Firebase app registration, SHA fingerprints, Firebase Auth Emulator coverage, and end-to-end staging verification remain pending. This work does not send SMS, change database state, activate referral codes, or alter production settings.
