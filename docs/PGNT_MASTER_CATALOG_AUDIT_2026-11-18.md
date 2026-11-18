# PGNT ASIAN TOPUP — Master Catalog Audit (2026-11-18)

## Scope and source

Reviewed the uploaded workbook `PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES-1.xlsx`, primarily its `All_Products`, `Operator_Summary`, `Service_Summary`, and `Duplicate_ID_Audit` sheets. Compared its product IDs and catalog fields with the existing 458-row offline DT One preview JSON.

This is an **offline source-data audit only**. It is not a live DT One API verification, a confirmation of current operator coverage, or permission to import/activate products.

## Master workbook totals

- 1,960 product rows in `All_Products`.
- 1,960 unique Product IDs; no repeated Product ID rows in that sheet.
- 4 countries and 28 operator/service labels in the operator summary (this includes eSIM, DTH/TV, and postpaid variants, not 28 ordinary mobile networks).
- 1,926 Mobile rows, 20 Utilities/Television rows, and 14 eSIM rows.
- Product types: 1,929 fixed-value recharge; 14 ranged-value recharge; 14 fixed-value PIN purchase; 3 ranged-value payment.
- Wholesale EUR and retail EUR fields are populated on all 1,960 rows.

### Country totals

| Country | Products | Operator/service labels |
|---|---:|---:|
| Afghanistan | 542 | 5 |
| Pakistan | 783 | 8 |
| India | 147 | 9 |
| Bangladesh | 488 | 6 |
| **Total** | **1,960** | **28** |

## Owner amount policy: 75–3,000 inclusive

Applied strictly to **fixed-value recharge** rows only. A denomination is eligible under this numerical policy only if it is an integer from 75 through 3,000 inclusive. Decimal denominations, ranged products, PIN purchases, eSIM, and utilities remain separate review classes.

| Country | Fixed recharge rows | Integer 75–3,000 | Decimal denomination in range | Below 75 | Above 3,000 |
|---|---:|---:|---:|---:|---:|
| Afghanistan | 537 | 460 | 17 | 37 | 23 |
| Pakistan | 772 | 698 | 0 | 8 | 66 |
| India | 140 | 115 | 0 | 19 | 6 |
| Bangladesh | 480 | 416 | 0 | 63 | 1 |
| **Total** | **1,929** | **1,689** | **17** | **127** | **96** |

The 17 decimal denominations are all Afghanistan rows. They fall numerically within the interval but are not integer top-up denominations; do not round them automatically.

## Comparison with previous 458-row offline preview

- All 458 previous preview Product IDs are present in the 1,960-row master workbook.
- 1,502 Product IDs are additional to the previous preview.
- 455 rows match the compared catalog fields exactly after country-code normalization.
- The remaining 3 rows are ranged recharge products. Their master workbook wholesale/retail fields contain full ranges, while the previous preview stores only the lower endpoint. This is a representation difference that must be preserved, not treated as a live price change.
- The old preview remains marked offline/unverified; overlap does not upgrade any row to provider-verified status.

## Duplicate source audit

The workbook's `Duplicate_ID_Audit` sheet lists four eSIM Product IDs that appeared in duplicate source CSV exports. The consolidated `All_Products` sheet contains each Product ID once. Therefore, source-file duplication is documented, but there are no duplicate Product ID rows in the consolidated master table.

## Required handling

1. Keep all imported candidates disabled.
2. Do not round the 17 decimal AFN denominations.
3. Keep ranged recharge, PIN purchase, ranged payment, eSIM, and Utilities/Television outside the fixed recharge amount-policy pass.
4. For each operator, require one owner-approved representative product; use its exact provider operator ID as the identity anchor for automated checks of other products.
5. Verify each candidate against DT One using the exact Product ID and confirm country, exact provider operator ID, product type, destination currency/amount, and EUR wholesale/retail prices.
6. Provider errors, identity mismatches, and incomplete evidence remain review-only.
7. Technical verification does not activate products or create payment/top-up transactions.

## Reproducible audit artifact

A detailed workbook containing the executive summary, country/operator summaries, all 1,960 rows with policy classifications, previous-458 comparison, and duplicate-source audit was generated as:

`PGNT_ASIAN_TOPUP_CATALOG_AUDIT_2026-11-18.xlsx`

The generated workbook is a review artifact; the source workbook and offline preview were not changed.
