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

The migration history contains historic ATOMA rows, and a newly supplied ATOMA CSV export was inspected on 2026-10-22. Keep existing rows inactive until the current export is reconciled with the catalog and sandbox flow:

| Operator | Amount | DT One product ID | Retail price recorded | Status |
|---|---:|---:|---:|---|
| ATOMA | 100 AFN | 7191 | Current CSV: €1.84 (wholesale €1.66) | Inactive; reconcile migration |
| ATOMA | 150 AFN | 7199 | €2.76 (wholesale €2.48) | In CSV; migration row missing |
| ATOMA | 250 AFN | 7203 | Current CSV: €4.61 (wholesale €4.14) | Inactive; reconcile migration |
| ATOMA | 500 AFN | 7213 | Current CSV: €9.19 (wholesale €8.27) | Inactive; reconcile migration |
| ATOMA | 1,000 AFN | 7233 | Current CSV: €18.37 (wholesale €16.53) | Inactive; reconcile migration |
| ATOMA | 115 AFN | 7194 | Current CSV: €2.13 (wholesale €1.91); older repository recorded €2.10 / €1.89 | Inactive; price discrepancy; verify and retest |

Prices above are historic repository values, not a claim that current provider prices or product availability have been verified.

### User-supplied DT One CSV exports (2026-10-22)

Four uploaded CSV exports were inspected. Each is an Afghanistan catalog export in AFN. These files are evidence of catalog records in the supplied export, not proof that the export is current or that pre-production fulfillment and checkout have passed.

#### Fixed-value products and requested denominations

| Operator | CSV rows | Fixed-value products | 100 AFN (ID / wholesale / retail) | 150 AFN (ID / wholesale / retail) | 250 AFN (ID / wholesale / retail) | 500 AFN (ID / wholesale / retail) | 1,000 AFN (ID / wholesale / retail) |
|---|---:|---:|---|---|---|---|---|
| Roshan Afghanistan | 120 | 119 | 6149 / €1.66 / €1.85 | 6157 / €2.48 / €2.76 | 6161 / €4.14 / €4.61 | 6171 / €8.27 / €9.19 | 6191 / €16.53 / €18.37 |
| Etisalat Afghanistan | 122 | 121 | 6478 / €1.66 / €1.85 | 6554 / €2.49 / €2.77 | 6558 / €4.14 / €4.61 | 6568 / €8.28 / €9.21 | 6588 / €16.56 / €18.41 |
| Afghan Wireless Afghanistan (AWCC) | 120 | 119 | 10531 / €1.63 / €1.82 | 10596 / €2.44 / €2.72 | 10599 / €4.07 / €4.53 | 10535 / €8.13 / €9.05 | 10536 / €16.25 / €18.06 |
| Salaam Afghanistan | 61 | 60 | 23130 / €1.66 / €1.85 | 23135 / €2.49 / €2.77 | 23142 / €4.15 / €4.62 | 23152 / €8.30 / €9.23 | 23172 / €16.60 / €18.45 |

Prices are copied from the supplied CSV columns `WHOLESALE PRICE (EUR)` and `RETAIL PRICE (EUR)`. They are not yet the final customer checkout price: the backend must calculate/verify its app fee and Stripe fee treatment, and the catalog must remain inactive until the product and sandbox flow pass.

#### Catalog coverage and open-range entries

- Roshan: 116 distinct fixed-value denominations in the export; one `Open_Range` row, product ID 11188, range 30–5,000 AFN.
- Etisalat: 117 distinct fixed-value denominations; one `Open_Range` row, product ID 11187, range 30–5,000 AFN.
- AWCC: 117 distinct fixed-value denominations; one `Open_Range_AFN` row, product ID 11186, range 50–5,000 AFN.
- Salaam: 60 fixed-value denominations; one `Open_Range` row, product ID 23182, range 25–4,000 AFN.

The open-range rows need separate API/schema/checkout verification before they can be offered. The app must not treat them as ordinary fixed denominations.

The four supplied CSV exports cover Roshan, Etisalat, AWCC, and Salaam. A fifth supplied CSV export covers ATOMA Afghanistan (119 rows, 118 distinct fixed-value denominations and one non-fixed/open-range row). Requested amounts in the current ATOMA export: 100 AFN ID 7191, wholesale €1.66 / retail €1.84; 150 AFN ID 7199, €2.48 / €2.76; 250 AFN ID 7203, €4.14 / €4.61; 500 AFN ID 7213, €8.27 / €9.19; 1,000 AFN ID 7233, €16.53 / €18.37. For 115 AFN ID 7194 the current CSV says wholesale €1.91 / retail €2.13, differing from older repository values. Reconcile catalog rows with this latest export before any activation. Placeholder IDs and illustrative UI prices must never be used for fulfillment.

## Verification checklist per provider product

1. Fetch the product from the account's DT One pre-production catalog and confirm its country, operator, product ID, benefit/denomination, and currency.
2. Record current provider wholesale cost and all relevant taxes/fees.
3. Calculate retail EUR price server-side, including application fee and Stripe processing costs; never use a public FX reference rate as a substitute for provider wholesale pricing.
4. Run an isolated pre-production test with a provider-approved test number and explicit admin confirmation.
5. Confirm transaction response and callback/final status, including safe handling of declined, pending, and unknown outcomes.
6. Keep the catalog row inactive until the test and checkout verification pass; never trigger live production fulfillment as part of catalog discovery.
7. Expose only verified active rows to the app. If a selected denomination is unavailable for an operator, hide/disable it rather than guessing.

## Current blocker

The current isolated sandbox route is hard-coded to ATOMA product ID 7194 and test scenarios. It does not yet test other operators. Migration `014_afghanistan_catalog_seed` has been committed to `migrate.js` on `feature/multi-payment-currencies`; it seeds 26 requested fixed-value rows (five requested amounts for each of five networks, plus ATOMA 115 AFN), with `bonus_amount=0` and `active=FALSE`. The migration has not been run against the database. Next, verify the schema and server-side pricing path, confirm provider-supported sandbox test rules for all five operators, and adapt the isolated test path to handle approved product IDs safely. Keep all catalog rows inactive until sandbox fulfillment and checkout pricing are verified. No credentials, live transactions, or catalog activation are performed by this document.
