# Country onboarding and expansion contract

## Purpose

This document defines the controlled process for adding a destination market to PGNT ASIAN TOPUP. The current runtime configuration supports Afghanistan (AF/AFN), Pakistan (PK/PKR), India (IN/INR), and Bangladesh (BD/BDT). The database registry introduced by migration 023 is a bootstrap registry; it is not yet the runtime source of truth. Do not describe country onboarding as fully dynamic until the API, admin workflows, and app country catalogue all read the validated registry.

## Non-negotiable rules

- EUR remains the customer payment and Stripe settlement currency for the current launch. A destination currency (AFN, PKR, INR, BDT, or a future currency) is not a payment currency.
- Never invent countries, operators, provider identifiers, denominations, increments, or FX rates.
- DT One is the authority for provider country/operator/product identifiers, supported destination currencies, product type, fixed denominations, ranged capability, minimum/maximum amount, and increment.
- An imported catalogue item is not customer-visible merely because it exists in the database. It must be verified against DT One, priced with an explicit approved FX/pricing configuration, tested in sandbox, and explicitly activated by an authorized admin.
- New country/operator/product rows start inactive and unverified. No onboarding migration or import may silently activate them.
- Keep existing fixed-value fulfillment unchanged when adding ranged-value fulfillment. Route each order by its explicit fulfillment type.

## Country onboarding lifecycle

1. **draft** — identity details proposed; not customer-visible.
2. **configuring** — calling code, phone digit rules, destination currency, language labels, and provider country mapping are being checked.
3. **testing** — provider country and operator identifiers are verified; catalogue/capability, FX, fees, pricing, and sandbox transaction tests are in progress. Still not customer-visible.
4. **active** — all required checks passed and an authorized admin explicitly activates the country.
5. **disabled** — temporarily unavailable; new orders must be blocked without corrupting existing order history.
6. **legacy** — retained for historical compatibility; not a general state for newly onboarded markets.

State transitions must be server-side and auditable. A client must never be able to activate a country, operator, product, or provider mapping.

## Required country record

Before testing, require:
- ISO 3166-1 alpha-2 country code and verified display name;
- destination ISO currency code;
- international calling code and validated national-number digit bounds;
- provider name and exact DT One country code;
- localizations for the supported app languages, with a defined fallback;
- approved FX source, rate, effective time, and admin approval;
- country status and monotonically increasing configuration version.

Reject malformed or conflicting country/currency/provider mappings. Never infer a currency from a country name.

## Operator and product verification

For each operator require:
- exact DT One provider operator identifier and country association;
- provider response evidence and verification timestamp;
- localized display names;
- inactive-by-default state.

For each product require:
- exact provider product identifier and operator/country association;
- provider product type (fixed or ranged);
- provider-supported currency;
- for fixed products, only the denominations returned by DT One;
- for ranged products, provider capability evidence, minimum, maximum, increment, and a fresh quote requirement;
- explicit wholesale cost/fee evidence and approved EUR pricing;
- sandbox success and reconciliation checks;
- inactive-by-default state until explicit admin activation.

A product with missing provider identity, currency mismatch, stale capability, invalid increment, or missing price evidence must remain unavailable.

## Go-live checklist

- Country configuration validated on the server; no client-supplied country data is trusted.
- Phone normalization and country-specific validation tested, including international prefixes.
- DT One country/operator/product IDs independently checked.
- Fixed and ranged product paths tested separately.
- EUR customer price includes wholesale cost, app fee, and Stripe fee using integer cents and documented rounding.
- Stripe Checkout and webhook verify canonical paid session, currency, amount, order identity, and idempotency.
- Ambiguous provider outcomes move to review; never blindly resubmit a top-up.
- Support/refund/reconciliation and admin audit trail tested.
- Country/operator/product explicitly activated by authorized admin only after sandbox evidence is reviewed.

## Current implementation boundary

Migration 023 creates the registry/localization/operator/product mapping tables and seeds the four existing markets. Its seeded operators and mappings are inactive and unverified. `country-config.js` currently centralizes the four supported markets for synchronous server validation. The next implementation phase must safely introduce a validated database-backed country configuration cache and admin workflow before removing the static runtime map. Do not apply migrations or activate live catalogue rows as part of documentation work.
