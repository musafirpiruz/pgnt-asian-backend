# Future-country onboarding architecture

Status: architecture and implementation requirements. This document does not enable a new country or change production data.

## Goal

Keep PGNT ASIAN TOPUP multi-country by configuration, not by adding country-specific code each time. The current supported markets remain AF, PK, IN and BD. Future markets must be onboarded through a controlled admin workflow after provider and payment acceptance.

## Core design principles

1. **One canonical country registry.** Use the canonical `country_registry` model already being reconciled by the integration work. Do not create a parallel country list or a second FX authority.
2. **Stable identity, localized labels.** Country code, operator key, DT One provider operator ID and DT One product ID are identifiers. Display names and translations are presentation only and must never be used as provider identity.
3. **EUR remains the customer payment currency.** Destination currency is country configuration. A destination FX reference rate is not a DT One wholesale price or a settlement guarantee.
4. **Provider-verified catalog only.** Every product needs a provider-verified product ID, country, operator, service type, destination currency, amount/range contract, and wholesale EUR cost before activation.
5. **Fail closed.** Missing or stale rates, missing phone metadata, ambiguous operator mappings, unknown service types, or unverified provider identities prevent country activation and checkout.
6. **No country-specific code branches for routine onboarding.** Country behavior should come from validated configuration and shared services. Exceptional provider-specific behavior belongs behind an adapter/interface, not scattered country-code conditionals.

## Country configuration contract

The canonical country record should contain or reference:

- ISO 3166-1 alpha-2 country code (unique primary key)
- ISO 3166-1 alpha-3 provider code where required by DT One
- localized country names keyed by supported language
- ISO 4217 destination currency code
- international calling code
- phone validation metadata (national number min/max length, trunk-prefix policy, and any numbering-plan metadata needed)
- customer availability status: `pending`, `active`, `paused`, or `retired`
- supported product/service categories
- supported languages and fallback language
- FX source, quote direction, observed timestamp, expiry/freshness policy, and last-good rate
- country-level pricing policy reference (EUR application fee, Stripe fee policy, and any approved overrides)

Use a maintained phone-number metadata library for actual numbering-plan validation where practical. A simple fixed digit count is not sufficient for many countries. Never infer a new country's phone rules from another country's configuration.

## Related data entities

- `country_registry`: canonical country identity, destination currency, status and provider country code.
- `country_localizations`: country display names by language.
- `country_operators`: stable internal `operator_key`, provider name/ID, active flag, verification timestamp.
- `country_operator_localizations`: operator labels by language.
- `product_catalog`: provider product IDs, destination denomination/range, service type, destination currency, wholesale EUR cost, provider verification state and active flag.
- `country_operator_products`: explicit verified mapping between an operator and a catalog product.
- FX history/provider-currency records: one authoritative reference-rate source with provenance, direction, timestamp and freshness.
- `pricing_settings`: country defaults; optional operator/service overrides only when explicitly configured and audited.

Do not let `operator_pricing_settings` or another child table impose a hard-coded four-country allowlist. Country foreign keys must reference the canonical registry, and any schema change must be a forward-only migration with conflict checks and backup/restore rehearsal.

## API and app contract

- Public country list returns only countries whose status is `active` and whose activation checks pass.
- Country details return country code, localized name, destination currency, calling code and supported service types.
- Operator list returns `operator_key`, provider identity metadata resolved server-side, and localized `display_name`.
- Flutter stores stable country/operator/product identifiers separately from display labels.
- Quote requests send country code, stable operator key, product reference/amount and recipient number. The backend resolves provider IDs and pricing from trusted records.
- Checkout revalidates the same quote, product mapping, destination currency, price and country status server-side. Client-provided prices or provider IDs are never authoritative.
- The UI must build country, operator and denomination lists from the API; no hard-coded four-country fallback should be treated as an activation source. An offline fallback may be shown only as non-purchasable information.

## Admin onboarding workflow

1. Create country in `pending` state with ISO codes, currency, calling code, numbering metadata and translations.
2. Validate ISO codes, currency, phone metadata and language fallback.
3. Discover operators and products from the authenticated DT One environment.
4. Match provider country/operator/product identities exactly; reject unknown or conflicting mappings.
5. Import into a dry-run preview; show insert/update/skip/reject counts and price changes.
6. Verify product service type, destination currency, fixed/ranged denomination behavior and wholesale EUR cost from provider detail/quote evidence.
7. Configure FX reference source and freshness limits. Missing/stale FX blocks local-currency display or country activation as defined by policy; it must never change the EUR wholesale price.
8. Configure country fee policy and Stripe fee model. Calculate EUR price server-side and reconcile actual Stripe balance-transaction fees.
9. Run quote-only tests for each operator/service family, including localized labels and invalid phone numbers.
10. Run DT One pre-production and Stripe test-mode payment/refund lifecycle tests on representative products.
11. Complete isolated migration, backup/restore rehearsal, security review, and Android/iOS regression tests.
12. Require an explicit admin approval action to change status from `pending` to `active`. Log actor, timestamp, evidence and config version.

## Activation gates

A country must remain unavailable for purchase if any of these are missing:

- valid ISO country and destination currency
- calling code and validated phone-number rules
- at least one verified operator and active verified product mapping
- provider-confirmed wholesale EUR price and service/product type
- current FX reference rate where local-currency conversion is displayed
- valid pricing settings and EUR quote calculation
- successful quote-only, sandbox payment/fulfillment, refund/reconciliation and app tests
- reviewed backup/restore and migration evidence

A country with no verified products may exist in Admin as pending, but must not be advertised as purchasable.

## Existing implementation gaps confirmed during source review

The integration branch has useful registry groundwork, but future-country onboarding is not complete yet:

- `SUPPORTED_COUNTRIES` in `server.js` is a hard-coded four-country map containing calling codes and phone digit lengths.
- `isValidCountry` checks that map, so a fifth country cannot pass shared validation without code changes.
- Admin pricing UI uses a hard-coded `countryCurrencies` map for AF/PK/IN/BD.
- Existing `operator_pricing_settings` migration defines a CHECK constraint limited to AF/PK/IN/BD.
- Country/operator registry migration history has competing legacy schemas that must be reconciled to one canonical model before any rollout.
- Phone validation currently uses static digit lengths; a generic country registry needs validated numbering-plan metadata or a phone library.
- The dynamic operator route and Flutter parser are groundwork only until migrations and the full quote/checkout contract are deployed and tested together.

These are explicit blockers, not claims that the current app already supports arbitrary new countries.

## Delivery sequence

1. Finish canonical registry schema reconciliation and migration tests.
2. Move country metadata and activation status to the canonical registry; keep a temporary compatibility adapter for AF/PK/IN/BD during transition.
3. Replace static phone validation with configuration-backed numbering metadata / maintained library.
4. Replace hard-coded Admin and Flutter country/currency lists with the active-country API.
5. Generalize country/operator pricing constraints and audit logging without weakening validation.
6. Complete stable operator/product identity from API through quote, checkout and fulfillment.
7. Run clean-install and upgrade migration tests, backup/restore rehearsal, regression, security audit and APK build.
8. Prove a fifth test country can be added in staging through Admin configuration without a code release; keep it non-purchasable until all gates pass.

## Safety boundary

This architecture work does not authorize production migration, catalog import, pricing edits, product activation, live payments/refunds, top-ups, or deployment. Each requires reviewed evidence and explicit approval.
