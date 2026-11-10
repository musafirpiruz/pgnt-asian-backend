# DT One-authoritative FX pricing

## Source of truth

For FX used by PGNT ASIAN TOPUP, use the live DT One DVS product response for the exact product/operator/corridor. DT One documents `rates.wholesale` as the wholesale conversion rate and the product response exposes source and destination currency units. The backend must not substitute a public-market FX feed, a cached legacy AFN value, or a rate inferred from another product.

The extraction helper in `dtone-fx.js` accepts a rate only when:

- the DT One product has a valid product ID;
- `source.unit` is exactly `EUR` (the app's payment currency);
- `destination.unit` matches the configured currency for that country;
- `rates.wholesale` is finite and positive.

The helper intentionally rejects products priced by DT One in USD or another source currency. Do not relabel USD rates as EUR. If the DT One account is configured to settle in USD, obtain an explicit EUR-priced DT One product/quote or a separately approved EUR conversion arrangement before using that rate for customer pricing.

## Scope and freshness

DT One rates are product/operator-specific. Do not assume one product's rate is a universal country FX rate. Store the product ID and operator ID in the observation reference, retain the fetch timestamp, and expire the observation after a short configured TTL (default 24 hours in the extraction helper). Refresh from DT One before pricing/checkout when the stored observation is stale.

For a fixed-denomination product, the final customer price must still use the exact DT One wholesale EUR amount for that product, plus the configured app fee and Stripe fee. The wholesale amount is authoritative for cost; the product's `rates.wholesale` is a reference conversion ratio and must not replace the exact wholesale amount. For ranged products, use the DT One quote/transaction response and keep `auto_confirm=false` until the customer has seen and accepted the confirmed price.

## Fail-closed behavior

If DT One does not return a valid EUR source currency, expected destination currency, or wholesale rate, mark the quote unavailable for customer checkout. Never silently fall back to an old AFN/PKR/INR/BDT rate. No product is activated by this helper.

## References

- DT One DVS product discovery: https://developers.dtone.com/reference/getproducts
- DT One ranged product pricing and response fields: https://developers.dtone.com/docs/new-mobile-template

This module is a parsing/validation foundation only. It does not call DT One, update PostgreSQL, change pricing, activate catalog entries, or submit transactions.
