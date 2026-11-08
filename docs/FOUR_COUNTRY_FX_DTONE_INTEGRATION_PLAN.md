# Four-country FX and DT One integration plan

Status: integration preparation only. This branch is not production-enabled.

## Scope
Preserve the existing Flutter and Node.js application. Complete Afghanistan (AFN), Pakistan (PKR), India (INR), and Bangladesh (BDT) using one server-authoritative pricing pipeline.

## Existing implementation to preserve
- PR #224: pricing quote error classification and legacy AFN rate compatibility (already merged).
- PR #203: automatic reference FX refresh for AFN/PKR/INR/BDT, 24-hour cadence, source timestamps, freshness validation, atomic updates, history, and preserve-last-good behavior.
- PR #196–#200: country registry, localization repair, checkout country/operator/denomination guards, provider operator identifiers, and explicit country/operator/product mapping.
- PR #204: dynamic country onboarding, currency discovery, admin workflow, and production acceptance runbook.

## Integration findings
- PR #196–#200 form a stacked chain: #196 targets main; #197 targets #196's branch; #198 targets #197's branch; #199 targets #198's branch; #200 targets #199's branch. Their recorded CI runs passed, but #196 has an outstanding focused review describing incomplete end-to-end operator registry wiring, discarded provider operator IDs in Flutter, incomplete locale translations, and missing verified backup/restore gate.
- PR #203 adds a legacy four-country FX refresh path writing pricing_settings.local_currency_per_eur and fx_rate_history.
- PR #204 adds generic provider-currency FX storage and dynamic-country FX refresh behavior. These models must be reconciled to a single authoritative FX source and explicit conversion direction/semantics before both refresh paths can be enabled.
- Migration version strings are distinct; the earlier claim of a direct duplicate migration-key collision was incorrect. Do not renumber migrations on that basis.

## Required implementation sequence
1. Reconcile PR #196–#200 as a stack, close the focused review gaps, and retain provider operator IDs from API through Flutter selection, quote, checkout, and fulfillment.
2. Reconcile FX data models: define reference recipient-currency rates vs provider settlement currency rates; choose one authoritative freshness/provenance policy; ensure pricing_settings and dynamic-country pricing consume the correct validated rate without duplicate schedulers or conflicting writes.
3. Keep Stripe checkout currency EUR. Use verified DT One wholesale product cost, configured PGNT fixed/percentage fee, and configured Stripe percentage/fixed fee to compute server-side customer EUR price. Do not treat public FX reference rates as DT One settlement guarantees.
4. Verify product currency and wholesale EUR cost before a catalog product can be activated. No inferred currency, guessed rates, or retail-price substitution.
5. Run clean database install and upgrade migration tests, rollback/restore rehearsal on isolated staging, backend syntax, full regression, security audit, and APK build.
6. Perform quote-only acceptance for representative products in all four countries. Only then proceed to DT One sandbox order and Stripe test-mode checkout/refund tests.
7. Production activation, real charges/refunds, live top-ups, SMS OTP activation, and deployment require separate explicit approval and verified backup/restore evidence.

## Current safety status
- No production database or pricing data changed by this plan.
- No products activated.
- No payment, refund, or top-up executed.
- No deployment initiated.
