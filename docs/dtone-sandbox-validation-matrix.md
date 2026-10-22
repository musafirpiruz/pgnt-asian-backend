# DT One pre-production validation matrix

Status: preparation checklist only. This document does not claim that any test below has been executed.

## Safety boundaries

- Use only the exact DT One pre-production host: `https://preprod-dvs-api.dtone.com`.
- Keep all catalog rows inactive until provider product mapping, customer pricing, payment evidence, and callback handling have been verified.
- Never use live Stripe credentials with the DT One pre-production host.
- Never retry a transaction with an unknown outcome until the saved order and DT One dashboard have been reconciled.
- The current `/api/admin/dtone/sandbox-test` route is intentionally limited to ATOMA product ID `7194` (115 AFN). It is not a test harness for all 26 catalog rows.
- A browser GET to `/api/dtone/callback` is not a valid callback test; the endpoint accepts POST and requires configured callback authentication.

## Catalog mapping checklist

These are catalog IDs selected from the provider exports and seeded by migration 014. Presence in this table does not prove current provider availability or successful fulfillment.

| Operator | Amount (AFN) | DT One product ID |
|---|---:|---:|
| Roshan | 100 | 6149 |
| Roshan | 150 | 6157 |
| Roshan | 250 | 6161 |
| Roshan | 500 | 6171 |
| Roshan | 1000 | 6191 |
| Etisalat | 100 | 6478 |
| Etisalat | 150 | 6554 |
| Etisalat | 250 | 6558 |
| Etisalat | 500 | 6568 |
| Etisalat | 1000 | 6588 |
| AWCC | 100 | 10531 |
| AWCC | 150 | 10596 |
| AWCC | 250 | 10599 |
| AWCC | 500 | 10535 |
| AWCC | 1000 | 10536 |
| Salaam | 100 | 23130 |
| Salaam | 150 | 23135 |
| Salaam | 250 | 23142 |
| Salaam | 500 | 23152 |
| Salaam | 1000 | 23172 |
| ATOMA | 100 | 7191 |
| ATOMA | 115 | 7194 |
| ATOMA | 150 | 7199 |
| ATOMA | 250 | 7203 |
| ATOMA | 500 | 7213 |
| ATOMA | 1000 | 7233 |

## Required manual pre-production checks

For each operator/product, record the actual DT One response and the provider dashboard result before considering that product verified:

1. Confirm the product ID, operator, denomination, currency, availability zone, and wholesale cost against the current DT One pre-production catalogue.
2. Confirm the product is still purchasable in pre-production and the test recipient/number is explicitly designated by DT One for that scenario. Do not assume a number that works for ATOMA works for other operators.
3. Verify the quote is computed from the catalog wholesale EUR cost, configured app fee, and Stripe fee estimate. FX reference rates must not replace provider wholesale cost.
4. Keep checkout disabled for the product while the above checks are incomplete.
5. If a sandbox transaction is sent, save the local order ID and provider transaction ID; verify status by read-only lookup and dashboard. Do not blindly repeat if the response is ambiguous.
6. Verify the authenticated POST callback using the exact callback protocol/credentials configured for the DT One pre-production account. Confirm callback payload status and provider transaction ID match the saved transaction.
7. Verify idempotency: duplicate callbacks must not duplicate fulfillment or referral reward; pending callbacks must not downgrade a review/completed state.
8. Record both completed and declined/failed cases where DT One explicitly supports them. A provider decline is not proof that a Stripe refund was issued.
9. Only after review, separately approve activation and production release. Do not enable products automatically as a side effect of testing.

## Evidence log template

For each test, record: date/time (UTC), operator, denomination, product ID, environment/host, test scenario, local order ID, provider transaction ID, HTTP status, initial provider status, final provider status, callback received/authenticated, dashboard status, outcome, reviewer, and notes. Never record API secrets, full callback credentials, or unnecessary customer phone data.
