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

### Newly supplied DT One CSV: Salaam Afghanistan

A user-uploaded CSV named `products_e9d96f2a-6f46-4af5-b9ff-473c5a318c7e_1792650302589.csv` was inspected on 2026-10-22. It contains 61 records, all with operator name `Salaam Afghanistan` and destination currency AFN. This provides catalog evidence for Salaam, but does not by itself prove the export is current or that pre-production fulfillment succeeds.

| Amount | Product ID | Wholesale EUR | CSV retail EUR |
|---:|---:|---:|---:|
| 100 AFN | 23130 | €1.66 | €1.85 |
| 150 AFN | 23135 | €2.49 | €2.77 |
| 250 AFN | 23142 | €4.15 | €4.62 |
| 500 AFN | 23152 | €8.30 | €9.23 |
| 1,000 AFN | 23172 | €16.60 | €18.45 |

Other Salaam denominations present in the file include 50, 70, 75, 80, 85, 90, 95, 110, 120, 130, 140, 160, 170, 175, 180, 190, 200, 225, 275, 300, 325, 350, 375, 400, 425, 450, 475, 525, 535, 550, 575, 600, 625, 650, 675, 685, 695, 700, 725, 738, 750, 775, 800, 825, 850, 875, 900, 925, 950, 975, 1,450, 2,000, 2,500, 3,000, and 4,000 AFN, plus an `Open_Range` product shown as 25–4,000 AFN. The file includes some product names without the operator prefix; verify their operator and product metadata before enabling them.

No authoritative product IDs or prices for Roshan, Etisalat, or AWCC were found in the accessible current repository search. Placeholder IDs and illustrative UI prices must never be used for fulfillment.

## Verification checklist per provider product

1. Fetch the product from the account's DT One pre-production catalog and confirm its country, operator, product ID, benefit/denomination, and currency.
2. Record current provider wholesale cost and all relevant taxes/fees.
3. Calculate retail EUR price server-side, including application fee and Stripe processing costs; never use a public FX reference rate as a substitute for provider wholesale pricing.
4. Run an isolated pre-production test with a provider-approved test number and explicit admin confirmation.
5. Confirm transaction response and callback/final status, including safe handling of declined, pending, and unknown outcomes.
6. Keep the catalog row inactive until the test and checkout verification pass; never trigger live production fulfillment as part of catalog discovery.
7. Expose only verified active rows to the app. If a selected denomination is unavailable for an operator, hide/disable it rather than guessing.

## Current blocker

The current isolated sandbox route is hard-coded to ATOMA product ID 7194 and test scenarios. It does not yet test other operators. To safely add tests for Salaam and the other operators, verify the supplied Salaam export is current, confirm product metadata and provider-supported sandbox test rules, and obtain the authoritative catalog export for Roshan, Etisalat, and AWCC. No credentials, live transactions, or catalog activation are performed by this document.
