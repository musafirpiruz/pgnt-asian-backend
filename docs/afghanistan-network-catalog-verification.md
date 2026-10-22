# Afghanistan Network Catalog Verification

Status date: 2026-10-22

## Scope

The customer-facing Afghanistan top-up flow must support these operators when their products are verified in the DT One account:

- Roshan
- Etisalat
- ATOMA (formerly MTN)
- AWCC
- Salaam

The app should show only denominations actually available for the selected operator. Requested denominations to check first are 100, 150, 250, 500, and 1,000 AFN, followed by any additional denominations returned by the provider catalog. A denomination must not be presented as purchasable merely because it appears in a UI mockup.

## Known repository records

The current migration history contains these ATOMA rows sourced from an earlier DT Shop export. They are deliberately inactive:

| Operator | Amount | DT One product ID | Retail price recorded | Status |
|---|---:|---:|---:|---|
| ATOMA | 100 AFN | 7191 | €1.65 | Inactive; re-verify |
| ATOMA | 250 AFN | 7203 | €4.11 | Inactive; re-verify |
| ATOMA | 500 AFN | 7213 | €8.21 | Inactive; re-verify |
| ATOMA | 1,000 AFN | 7233 | €16.41 | Inactive; re-verify |
| ATOMA | 115 AFN | 7194 | €2.10 retail / €1.89 wholesale | Inactive; prior pre-production evidence exists; checkout must be retested |

Prices above are historic repository values, not a claim that current provider prices or product availability have been verified.

No authoritative product IDs or prices for Roshan, Etisalat, AWCC, or Salaam were found in the accessible current repository search. Placeholder IDs and illustrative UI prices must never be used for fulfillment.

## Verification checklist per provider product

1. Fetch the product from the account's DT One pre-production catalog and confirm its country, operator, product ID, benefit/denomination, and currency.
2. Record current provider wholesale cost and all relevant taxes/fees.
3. Calculate retail EUR price server-side, including application fee and Stripe processing costs; never use a public FX reference rate as a substitute for provider wholesale pricing.
4. Run an isolated pre-production test with a provider-approved test number and explicit admin confirmation.
5. Confirm transaction response and callback/final status, including safe handling of declined, pending, and unknown outcomes.
6. Keep the catalog row inactive until the test and checkout verification pass; never trigger live production fulfillment as part of catalog discovery.
7. Expose only verified active rows to the app. If a selected denomination is unavailable for an operator, hide/disable it rather than guessing.

## Current blocker

The current isolated sandbox route is hard-coded to ATOMA product ID 7194 and test scenarios. It does not yet test other operators. To safely add tests for the other four operators, their actual DT One product IDs and provider-supported sandbox test rules must first be confirmed from the user's DT One account/export. No credentials, live transactions, or catalog activation are performed by this document.
