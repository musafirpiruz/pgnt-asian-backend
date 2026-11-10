# Four-country DT One Shop catalog inventory — 2026-11-10

Status: source-file inventory and reconciliation only. This is **not** a DT One live API verification, production import, or activation approval.

## Source-file results

- CSV files inspected: 29
- Raw CSV rows: 1,964
- Unique Product IDs after exact-ID de-duplication: 1,960
- Repeated Product IDs: 4 IDs (8 rows); the repeated entries are from the Pakistan eSIM export uploaded twice.
- Missing wholesale EUR prices in retained rows: 0
- Missing retail EUR prices in retained rows: 0
- Country/operator/service groups: 28

## Country totals

| Country | Unique products | Operator/service groups |
|---|---:|---:|
| Afghanistan | 542 | 5 |
| Pakistan | 783 | 8 |
| India | 147 | 9 |
| Bangladesh | 488 | 6 |
| **Total** | **1,960** | **28** |

## Operator/service inventory

### Afghanistan — 542
- ATOMA Afghanistan — 119
- Afghan Wireless Afghanistan — 120
- Etisalat Afghanistan — 122
- Roshan Afghanistan — 120
- Salaam Afghanistan — 61

### Pakistan — 783
- Jazz Pakistan — 197
- Jazz Pakistan Postpaid — 1
- Telenor Pakistan — 194
- Telenor Pakistan Postpaid — 1
- Ufone Pakistan — 194
- Ufone Pakistan Postpaid — 1
- Zong Pakistan — 191
- eSIM Pakistan — 4

### India — 147
- Airtel India — 39
- BSNL India — 31
- Reliance Jio India — 50
- eSIM India — 7
- DTH Airtel — 5
- DTH Dish TV — 2
- DTH Sun Direct — 3
- DTH Tata-Sky — 5
- DTH Videocon — 5

### Bangladesh — 488
- Airtel Bangladesh — 103
- Banglalink Bangladesh — 95
- GrameenPhone Bangladesh — 131
- Robi Bangladesh — 98
- Teletalk Bangladesh — 58
- eSIM Bangladesh — 3

## Product types and service handling

The exports contain Mobile Airtime, Data and Bundle products, DTH Television utility products, and eSIM products. Preserve these service categories as distinct product types in the application. Do not flatten DTH/eSIM into mobile airtime.

The Bangladesh Robi export includes both fixed-value and ranged-value recharge rows. Ranged products must not be displayed as fixed denominations; they require a provider-supported quote/min/max/step contract and server-side validation.

## Pricing interpretation

- Customer payment currency remains EUR.
- Use each product's DT One CSV `WHOLESALE PRICE (EUR)` as source evidence for its provider cost, subject to live/pre-production product identity and quote verification.
- CSV `RETAIL PRICE (EUR)` is source-export data, not an instruction to override the platform's pricing formula.
- PGNT application fee target: EUR 0.49 per applicable transaction.
- Stripe fee must be computed from the actual configured Stripe pricing policy and reconciled to the Stripe-reported balance transaction fee after payment. The current database stores a 1.5% + EUR 0.25 estimate; this is not proof that Stripe's actual fee is always identical.
- FX reference rates (AFN/PKR/INR/BDT per EUR) are for destination-currency display/conversion only; they must not replace DT One wholesale EUR pricing.

## Required gates before catalog import or activation

1. Reconcile every CSV Product ID and operator against the authenticated DT One product/operator API in the intended environment.
2. Establish a stable internal `operator_key` and server-trusted `provider_operator_id` mapping for each operator. Never infer provider IDs from display names.
3. Verify destination currency, product type, wholesale EUR cost, and fixed/ranged behavior for each product.
4. Reject duplicate or ambiguous mappings and preserve an audit record for source file, import batch, and provider verification timestamp.
5. Run a dry-run import and report inserts, updates, skipped duplicates, invalid rows, and changed prices before any database write.
6. Keep every imported product disabled until representative quote-only acceptance passes for each operator/service group.
7. Complete isolated staging migration, backup/restore rehearsal, API/Flutter operator identity contract tests, and Stripe test-mode + DT One pre-production checkout/refund tests.
8. No live top-up, real charge/refund, production database write, migration, activation, or deployment is authorized by this inventory.

## Current database / release caution

The currently inspected Render database still records fee_eur_cents = 59 for AF, PK, IN and BD, with Stripe estimate 1.5% + EUR 0.25. The requested EUR 0.49 fee has **not** been applied. The database migration history is at `016_payment_currency_settings`; later registry/catalog migrations remain pending. The Render service starts with `node migrate.js && node server.js`, so merging migration changes can run schema changes on startup. Review and rehearse migrations against a backup before deployment.

The legacy Render database `pgnt-asian-db` is suspended; the active database is `pgnt-asian-tp`. Do not delete or replace either database as part of catalog import without a separately verified backup and explicit approval.
