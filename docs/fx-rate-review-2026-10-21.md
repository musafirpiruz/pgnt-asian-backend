# PGNT ASIAN TOPUP — Four-Country FX Rate Review

Review date: 2026-10-22  
Reference date used: 2026-10-21 (latest official/central-bank publication located during this review)

## Purpose

This is a review worksheet, not a live pricing update. Customer payments remain in EUR. The rates below are reference rates used to compare local-currency values; they are not DT One wholesale rates, Stripe settlement rates, or guaranteed executable conversion prices.

## Reference rates

| Country | Currency | Reference rate per EUR | Source/date | Existing seeded rate |
|---|---|---:|---|---:|
| Afghanistan | AFN | 72.7800 | Da Afghanistan Bank, transfer sell, 2026-10-21 | 72.8325 |
| Pakistan | PKR | 311.2606 | Financial Markets Association of Pakistan bulletin reported by APP, EUR reference for settlement date 2026-10-21 | 310.7630 |
| India | INR | 106.1265 | ECB euro reference rate, 2026-10-21 | 106.4700 |
| Bangladesh | BDT | 138.9140 | Bangladesh Bank, EUR bid cross-rate, effective 2026-10-19 | 138.6300 |

## Source links

- Afghanistan: https://www.dab.gov.af/exchange-rates?v=1.0.22
- Pakistan: https://www.app.com.pk/business/foreign-exchange-rates-1102/
- India: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.eu.html
- Bangladesh: https://www.bb.org.bd/en/index.php/econdata/exchangerate

## Important caveats

- These sources publish different kinds of rates (transfer sell, settlement/reference, ECB reference, and bid cross-rate). They are not perfectly equivalent.
- The ECB explicitly says its reference rates are for information and strongly discourages using them for transaction purposes.
- Bangladesh Bank's source was effective 2026-10-19, not 2026-10-21.
- Before using any rate for customer-facing prices, choose a consistent policy (for example, daily reference rate plus a documented FX buffer), confirm the provider's actual settlement/wholesale cost, and confirm the pricing calculation and rounding rules.
- Do not overwrite current production pricing automatically based only on this worksheet. The currently configured values should be read from the database first; any change should be reviewed and saved by the owner in the admin pricing panel.
- Keep the general bonus disabled. Referral rewards remain a separate, fixed EUR-cent ledger.

## Implementation checklist

1. Read current pricing settings for AF, PK, IN, and BD from the production database using the admin read-only pricing endpoint.
2. Compare current database rates to this worksheet and calculate the effect on representative top-up amounts.
3. Confirm a consistent FX policy and any safety margin with the owner.
4. Save changes via the admin pricing panel only after review.
5. Re-test quotes, fees, rounding, Stripe EUR amount, and DT One product wholesale costs in sandbox.
6. Never activate an unverified DT One product as part of an FX-rate change.
