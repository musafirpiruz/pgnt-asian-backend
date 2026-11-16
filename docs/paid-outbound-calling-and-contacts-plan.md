# PGNT ASIAN TOPUP — paid outbound calling and contacts plan

Status: design-only proposal; no provider selected, no calls enabled, no wallet debits, and no production changes.

## Product scope

Add paid outbound calls from the PGNT ASIAN TOPUP Flutter app to ordinary mobile and landline numbers in:
- Afghanistan (+93)
- Pakistan (+92)
- Bangladesh (+880)
- India (+91)

The recipient does not need to install PGNT ASIAN TOPUP. Calls are internet-originated from the app and terminated to the public telephone network (VoIP-to-PSTN). This is not free in-app calling.

Also add an in-app Contacts area so a customer can select a number from their device contacts (only after permission) or add a contact manually. Contacts must remain private to that customer; do not upload the full address book by default.

## Provider selection gate

Do not hard-code MyVoipTraffic, SIPTraffic, Twilio, Vonage, or any other provider yet. Public rate pages are indicative only and may vary by destination operator, route quality, billing increment, connection fee, caller-ID rules, tax, and account type.

Before selecting a provider, obtain written confirmation for all four destinations and relevant mobile operators:
1. Per-destination/per-operator mobile termination rate and currency.
2. Billing increment (per second, 30/6, 60/60, etc.), minimum charge, and connection fee.
3. Route type and quality/SLA; mobile-network coverage and excluded ranges.
4. Caller ID requirements and permitted CLI presentation.
5. Account eligibility, KYC/company documents, minimum top-up/deposit, expiry and refund terms.
6. SIP trunk/API support, authentication, call status events/webhooks, CDR export, concurrency limits and support.
7. Test-call availability without a large prepaid commitment.

Choose the lowest total-cost provider only among routes that pass quality, compliance, coverage and integration checks. Keep the provider behind an adapter so a second provider can be added for failover or cheaper routes. Do not automatically fail over an active call.

## Customer pricing and billing

- Show the final customer tariff in EUR before the customer confirms the call.
- Admin controls customer retail price per destination country and, where supported by reliable route data, per operator.
- Keep provider cost, customer retail price, tax, margin and FX evidence as separate fields.
- Never copy public website prices into production pricing automatically.
- Do not charge for unanswered, rejected, busy or failed calls unless the provider's verified CDR and agreed tariff explicitly establish a charge; reconcile exceptions before posting.
- Calculate charges from authenticated provider call events/CDRs, not from the Flutter device clock.
- Use the provider's exact billing increment and rounding rules; display those rules to customers.
- Before connecting, reserve sufficient wallet funds for a disclosed maximum duration or use a secure periodic authorization/credit-control mechanism. End the call before the reservation is exhausted. Release unused reservation after final reconciliation.
- All wallet reservations, debits and releases must use an atomic, idempotent, immutable ledger flow with row locking. Never allow a negative wallet balance.
- Handle duplicate, delayed, out-of-order and missing provider events; reconcile against provider CDRs. Provide a dispute/support path.
- Do not activate paid calls until wallet write safety, CDR reconciliation, pricing evidence, refunds/disputes and concurrency tests pass.

## Backend architecture proposal

1. Provider-neutral outbound-call service and adapter interface.
2. Destination normalization/validation in E.164 format; block premium-rate, emergency and restricted destinations unless separately approved and legally supported.
3. Pre-call quote endpoint returns destination, currency, customer rate, billing increment, estimated cost and maximum authorized duration.
4. Call initiation requires authenticated customer identity, accepted quote, sufficient wallet reservation, idempotency key and provider authorization.
5. Signed provider webhook endpoint validates signatures, timestamps and replay protection.
6. Call state machine: requested -> ringing -> answered -> completed, with failed/busy/no-answer/cancelled states.
7. Final CDR reconciliation calculates the exact charge and posts one ledger debit; release unused reservation.
8. Admin controls for provider status, country/operator retail tariffs, margins, route restrictions, limits, and audit history. Secrets remain in encrypted hosting environment variables.
9. Global kill switch and per-country/per-provider disable switches.

## Flutter app experience

- Add a Calls screen with dial pad, country code, destination number, displayed tariff, quote confirmation, call state, mute/speaker controls if supported, and call history.
- Clearly show that charges begin according to the disclosed provider billing rule (typically after answer/connect), not merely when dialing.
- Warn when a call may be expensive; show current balance and maximum authorized duration.
- Handle permission denial, network loss, app backgrounding, call termination and provider errors safely.
- Add a Contacts screen: manual add/edit/delete and optional device-contact picker. Request contacts permission only when the user taps import/select. Do not continuously sync or upload the address book.

## Security, privacy and compliance

- Verify customer identity on the backend; never trust a client-supplied customer ID or wallet balance.
- Protect call initiation against replay, duplicate requests, toll fraud, premium-rate abuse and account takeover.
- Apply per-user, per-destination, per-day and concurrent-call limits; add anomaly detection and manual review.
- Protect provider credentials and webhook secrets; never place them in Flutter or commit them to Git.
- Minimize call metadata retention and never record audio by default. If recording is ever introduced, require a separate legal/privacy assessment and explicit notice/consent.
- Complete applicable telecom, caller-ID, privacy, consumer pricing and KYC checks for France/EU and destination countries before launch.
- Contacts permission must be optional; manual entry remains available. Do not use contact data for marketing or referral attribution.

## Required test evidence and release gates

- Unit tests for E.164 parsing, destination restrictions, tariff selection, billing increments, rounding and quote expiry.
- Provider-adapter contract tests using mocked/sandbox events.
- Webhook signature, replay, duplicate, delayed and out-of-order event tests.
- Wallet concurrency, reservation, insufficient-funds, idempotency, final debit and release tests.
- CDR-vs-ledger reconciliation tests and call failure/no-answer billing tests.
- Flutter permission-denied and manual-contact tests; verify no address-book upload occurs.
- Staging test calls to all four countries and multiple mobile operators with verified CDRs and call-quality review.
- Written provider tariff and KYC confirmation; legal/privacy review; owner approval before any prepaid deposit, production credential, wallet write, live call, tariff activation or production deployment.

## Current decision

This document records the requested feature only. It does not select a carrier, assert that any public tariff is contractually available, create a provider account, spend money, change the database, enable wallet debits, or deploy anything.
