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


## Public rate snapshot checked 2026-11-16

The following are public list prices displayed by the providers at the time of review. They are wholesale reference rates, not a binding quote, not a customer retail tariff, and not evidence that every number range or route will connect. Values are EUR per minute.

| Destination | SIPTraffic public list | MyVoipTraffic public list | Lower displayed list |
|---|---:|---:|---|
| Afghanistan AWCC | €0.1076 | €0.1122 | SIPTraffic |
| Afghanistan Etisalat | €0.1205 | €0.1242 | SIPTraffic |
| Afghanistan MTN | €0.1038 | €0.1071 | SIPTraffic |
| Afghanistan Roshan | €0.1200 | €0.1103 | MyVoipTraffic |
| Pakistan Jazz | €0.0389 | €0.0389 | Tie |
| Pakistan Telenor | €0.0489 | €0.0389 | MyVoipTraffic |
| Pakistan Ufone | €0.0519 | €0.0389 | MyVoipTraffic |
| Pakistan Zong | €0.0389 | €0.0389 | Tie |
| Bangladesh Grameenphone | €0.0108 | €0.0098 | MyVoipTraffic |
| Bangladesh Robi Axiata | €0.0109 | €0.0100 | MyVoipTraffic |
| Bangladesh Banglalink | €0.0170 | €0.0170 | Tie |
| India Airtel | €0.0215 | €0.0215 | Tie |
| India BSNL | €0.0190 | €0.0190 | Tie |
| India Reliance Jio | €0.0215 | €0.0215 | Tie |
| India Vodafone / Vodafone Idea | €0.0215 | €0.0215 | Tie |

Sources checked:
- SIPTraffic rates page, displayed download date 2026-11-03: https://www.siptraffic.com/calling-rates/
- MyVoipTraffic rates page, displayed download date 2026-09-29: https://www.myvoiptraffic.com/calling-rates
- SIPTraffic product/connectivity information: https://www.siptraffic.com/product.html
- MyVoipTraffic getting-started/connectivity information: https://www.myvoiptraffic.com/getting-started
- MyVoipTraffic signup requires business/registered-organization details and company registration evidence: https://www.myvoiptraffic.com/signup
- MyVoipTraffic about page states a €300/USD 300 minimum top-up, SIP protocol and real-time CDRs: https://www.myvoiptraffic.com/about

Important interpretation:
- SIPTraffic advertises Bronze (lowest rate, no guaranteed quality), Silver (high quality) and Gold (very good quality) routes; its published page says per-second billing, prepaid service and a few test calls before prepayment.
- MyVoipTraffic advertises Grey (lowest rate, no guaranteed quality), Standard (high quality) and Premium (best quality) routes; its public getting-started page says per-second billing for destinations except Mexico.
- The two displayed rate pages are not from the same date, and the listed routes/quality tiers are not proven equivalent. Do not declare a winner based on the table alone.
- MyVoipTraffic's €300 minimum top-up is a significant barrier for an initial small-scale test. SIPTraffic publicly says a few test calls are possible before prepayment, but the exact deposit/KYC terms still need written confirmation.
- No provider account has been created, no calls have been placed, and no money has been spent.

## Updated provider decision

Do not yet choose a single production carrier. Shortlist:
1. SIPTraffic Silver for a quality-oriented test, with Bronze only as a separately measured low-cost comparison.
2. MyVoipTraffic Standard for a quality-oriented test, with its Grey route only as a separately measured low-cost comparison.

Ask both providers for a written, date-stamped quote for the exact mobile operators above, route class, caller-ID policy, test-call conditions, KYC eligibility for the PGNT legal entity, minimum deposit, API/SIP integration details, CDR delivery, concurrency limits and support/SLA. Select by total verified cost plus measured call quality and compliance, not by cheapest Grey/Bronze rate alone.
