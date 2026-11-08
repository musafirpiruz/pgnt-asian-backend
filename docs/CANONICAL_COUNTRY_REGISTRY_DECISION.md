# Canonical country registry decision — integration draft

Status: architecture decision for review; no production migration or activation.

## Decision

Use `country_registry(country_code)` as the single canonical country parent for the dynamic-country architecture. Adapt the smaller PR #196–#200 registry/API work to this parent rather than maintaining both `countries` and `country_registry` as competing authorities.

Rationale:
- PR #204's dynamic onboarding, country configuration/versioning, provider mappings, product catalog, FX observations, sync runs, activation checks, and customer APIs consistently query `country_registry`.
- The goal includes adding countries beyond the initial four. The dynamic onboarding and catalog model is the more complete target architecture.
- PR #196's `countries` model is a narrower initial registry and can be represented as a compatibility/import source; it should not remain a second source of truth.
- This decision does not authorize merging PR #204 wholesale. Its branch is substantially divergent and each route/migration still requires reconciliation with current main.

## Canonical operator API contract

The customer endpoint `GET /api/countries/:countryCode/operators?language=xx` must return:

```json
{
  "countryCode": "AF",
  "language": "ps",
  "operators": [
    {
      "operator_key": "stable-server-key",
      "provider_operator_id": "provider-id",
      "display_name": "localized operator label"
    }
  ]
}
```

Contract rules:
- `operator_key` is the stable client selection key and must not be derived from a translated display name.
- `provider_operator_id` is server-origin metadata. Flutter may retain it for display/debugging if needed, but must never submit it as authority in quote or checkout requests.
- Flutter quote and checkout submit `operatorKey`; the backend resolves provider ID and product mapping from its own trusted database.
- A row with no verified provider ID must not be eligible for a live quote, checkout, or fulfillment. Legacy display-name fallback may remain for existing deployed behavior only while the registry path is explicitly unavailable; it must not silently masquerade as a verified registry result.
- The response must preserve the same stable key across all six supported languages; only `display_name` may vary.

## Forward-only reconciliation requirements

A new migration must normalize all supported starting states to the canonical `country_registry` model:
1. Clean current-main database with neither registry.
2. PR #196 schema applied first (`countries` parent and its shared child tables).
3. PR #204 schema applied first (`country_registry` parent and its shared child tables).
4. Both registry roots and both migration ledger entries present.

The migration must:
- Run transactionally and be forward-only; never drop or truncate registry data.
- Inspect actual columns, primary/unique constraints, foreign keys, and migration ledger before changing shared tables.
- Upsert country rows from `countries` into `country_registry` with explicit field mapping. Map old active countries to a non-customer-enabling legacy state unless their provider mapping and activation checks are independently verified.
- Preserve country/operator/localization/provider/product/FX/audit rows. Do not invent provider IDs, FX values, verification timestamps, or approval status.
- Add missing canonical columns in a nullable or safe-default state first. Preserve legacy operators with missing provider IDs as inactive/unverified.
- Reconcile child foreign keys only after copying and validating parent rows. Repoint foreign keys to `country_registry(country_code)` after checking every child key has a canonical parent.
- Detect duplicate/conflicting country codes, operator keys, provider IDs, and localization keys. On ambiguous conflicts, raise an exception and roll back; do not pick a winner silently.
- Preserve IDs where possible and repair sequences after any explicit ID copy.
- Record a reconciliation audit/version marker only after every assertion succeeds.
- Leave country, operator, provider, product, and checkout activation unchanged/disabled unless a separately reviewed activation process authorizes it.

## Required PostgreSQL assertions

For each of the four starting states above, assert:
- Exactly one canonical country parent is used by every registry child foreign key.
- No child rows are orphaned; row counts and stable keys are preserved.
- Operator rows lacking a provider ID remain inactive and cannot be used by customer quote/checkout.
- All six language labels remain linked to the same stable operator key.
- Duplicate/conflicting keys cause a deterministic rollback with original rows intact.
- The migration is idempotent when run a second time.
- Existing current-main pricing, product catalog, orders, refunds, wallet ledger, and payment records are byte-for-byte/row-count unchanged.

## API alignment work still required

The PR #204 customer operator endpoint currently returns `code`, `name`, and `providerName`, and its SQL does not return `provider_operator_id`. The Flutter parser can read `code` as an operator key, but the endpoint must be changed to the canonical response above and only expose provider IDs from verified server registry rows. The PR #196 endpoint already returns `operator_key` and `provider_operator_id`, but queries the non-canonical `countries` parent and must be adapted.

## Safety gate

This document is a design decision only. No migration has been run, no production data was changed, no country/operator/product was activated, and no payment, refund, top-up, or deployment was performed. Keep PR #225 draft until implementation and PostgreSQL tests pass from all starting states, then complete backup/restore rehearsal and sandbox acceptance tests.


## Long-term extensibility contract — future countries

The product must be country-data-driven, not country-code-driven. Afghanistan, Pakistan, India, and Bangladesh are the initial launch set, not a permanent code limit. Adding a country must be an admin onboarding/configuration operation plus provider/catalog verification; it must not require a new country-specific code branch, database table, or app release for ordinary country metadata.

### Canonical data model

- `country_registry` is the only country source of truth. Use ISO 3166-1 alpha-2 country codes as stable keys and ISO 4217 currency codes for destination/payment currencies.
- Country records hold display name, destination currency, calling code, phone validation policy, status, provider mapping, configuration version, and timestamps. Do not encode country-specific behavior in a growing switch statement.
- Country localizations are data rows keyed by `(country_code, language_code)`; missing translations use an explicit fallback chain and never change country identity.
- Operators are keyed by a stable internal `operator_key`, scoped to country and provider. Localized names are labels only. Provider operator IDs are server-side identifiers, unique in their provider scope, and never accepted as client authority.
- Products/denominations are provider catalog rows linked by foreign keys to country and operator. Store recipient denomination/currency separately from verified provider wholesale amount/currency and EUR customer price. Never infer one currency from another.
- Provider mappings and provider capabilities are separate from country identity. A country may be configured for more than one provider over time; provider-specific credentials and identifiers stay server-side.
- FX observations must state base currency, quote currency, direction, source, observed/fetched time, and whether they are reference-only or provider settlement data. Never let public reference FX silently become DT One settlement pricing.

### Runtime and API rules

- Customer APIs read active, reviewed configuration from the registry. They must not return draft/testing/disabled countries as purchasable.
- The country list endpoint returns only customer-visible countries with supported configuration. Flutter builds country/operator/product choices from these APIs; local hard-coded lists are fallback/offline display only and must not decide whether checkout is permitted.
- Country/operator/product identity remains stable across all supported UI languages. Changing language changes labels only.
- Phone validation is country-configured (calling code, min/max digits, and, when needed, a versioned validation rule); do not assume all countries have the same phone length or numbering plan.
- Quote and checkout resolve `countryCode + operatorKey + denomination/productKey` on the server. Checkout re-reads the verified active provider mapping and product inside its database transaction. Client-supplied provider IDs, wholesale prices, FX rates, fees, or final prices are ignored.
- Checkout currency remains an explicit payment-currency policy (currently EUR). Destination currency and payment currency are independent. Supporting another payment currency requires a separately tested pricing/Stripe policy, not merely adding a currency code.
- Use provider adapters behind a common contract (catalog discovery, quote/price verification, order submission, status lookup, refund/reversal capability, callbacks). Provider-specific API differences must not leak into Flutter or country identity.
- New country onboarding follows a state machine: `draft → configuring → testing → active`, with `disabled` as a reversible operational state. Activation requires verified country/provider mapping, at least one verified operator and product, currency/wholesale verification, phone rules, sandbox quote/order/status acceptance, and an audit record. Failed checks block activation.
- Unknown country/operator/product keys fail closed with a clear customer-safe error. Do not silently fall back from a registry selection to a different operator with a similar display name.

### Adding a country acceptance checklist

For every new country, tests must cover:
1. Country metadata and ISO currency/calling-code validation.
2. Localized country and operator labels for all app languages, with fallback behavior.
3. Phone normalization and valid/invalid boundary cases.
4. Provider country/operator/product mappings and duplicate-ID protection.
5. Denomination/currency matching and verified wholesale price in its actual source currency.
6. FX direction, source, freshness, and reference-vs-settlement separation.
7. EUR customer price calculation including app fee and Stripe percentage/fixed fee.
8. Quote-only API resolution by stable keys, independent of localized display names.
9. Sandbox checkout, callback/status reconciliation, duplicate webhook/idempotency, and failure/review handling.
10. Admin audit log, disable/re-enable behavior, and preservation of existing orders/ledger/history.

### Architectural guardrails

- Do not add country-specific SQL tables, migrations, Flutter branches, or API routes for each new country.
- Do not hard-code the supported-country allowlist in server validation once the registry becomes canonical. Validate ISO shape, then authorize by registry status and verified configuration.
- Keep schema migrations additive/forward-only where possible, tested from clean install and every supported historical schema. Reconciliation conflicts must abort transactionally.
- Make configuration changes versioned and auditable. Cache keys must include country configuration version and language where labels are cached.
- Keep provider credentials, provider IDs, settlement details, and fraud controls on the server.
- New-country support is not complete merely because a country appears in a dropdown. It is complete only after the entire quote → payment → provider fulfillment → callback/status → support/review path passes sandbox acceptance.

These requirements are the target architecture. They do not assert that the current main branch or current PR already implements every item.

### Country-independent customer amount policy (10–3000)

The product requirement is that the customer-facing amount entry policy be configurable per country and not hard-coded to the initial four countries:

- The default requested customer range is inclusive: minimum 10 and maximum 3000 in that country's destination currency.
- Store the policy as country configuration (for example, `minimum_topup_amount`, `maximum_topup_amount`, and `amount_step`), with an explicit configuration version and audit history. Do not add country-specific constants or Flutter branches.
- Flutter obtains the amount policy from the active country configuration API and validates the entered integer for immediate feedback. The backend independently validates every quote and checkout request against the same active country policy; client validation is never trusted.
- Operators/products also have provider capability metadata: fixed denomination versus ranged/custom amount, provider minimum, provider maximum, and provider increment/step. A quote is allowed only when the requested amount is within both the country policy and the selected provider product's verified capabilities.
- For a ranged DT One product, the backend must use the exact DT One transaction contract for ranged recharge and verify the provider's required amount/currency fields before accepting a quote. For fixed-denomination products, only the provider's exact supported denomination may be submitted; do not pretend that an arbitrary amount is supported.
- If the country-wide 10–3000 policy cannot be fulfilled for a selected operator because the provider has narrower limits or only fixed denominations, show a clear unavailable-amount message and do not create a payment session or top-up order. Admin onboarding must report the unsupported range and block country/operator activation if the product requirement is mandatory.
- A new country inherits the same requested 10–3000 policy by configuration, but it is not considered launch-ready until its provider/operator coverage has been verified across the range (including boundaries, representative interior values, and increment rules) in sandbox. If the provider cannot deliver the required range, do not mark that operator/country active or advertise full-range support.

The requested 10–3000 range is a PGNT product policy, not a claim that every DT One operator currently supports every integer. Provider capability verification is a mandatory launch gate, not a reason to silently narrow the range or fabricate a quote.


### One-time operator approval and automatic amount handling

The administrative approval unit is the verified operator/product capability configuration, not every customer-entered amount.

1. An administrator reviews and approves the operator once for a country/provider combination, including the provider operator ID, eligible product IDs/types, destination currency, provider amount limits/step, pricing source, and required beneficiary fields.
2. The approval is versioned and auditable. Any change to provider mapping, product type, currency, min/max/step, or pricing contract invalidates the prior approval and returns the configuration to review/testing.
3. After approval, a customer amount is automatically eligible only when it passes the active country policy and the exact selected provider product capability. No separate administrator approval is needed for each amount.
4. For `RANGED_VALUE_RECHARGE`, the backend validates the requested destination amount against the verified provider minimum, maximum, currency, and increment. The transaction adapter must send the documented `calculation_mode: DESTINATION_AMOUNT` and `destination: { unit_type: CURRENCY, unit, amount }` fields. The provider price must be verified before final confirmation; the ranged-value flow must not reuse a fixed-denomination wholesale price as though it were the customer's chosen amount.
5. For `FIXED_VALUE_RECHARGE`, only the exact fixed denomination is eligible. Other values are rejected with an unavailable-amount response and cannot create a payment session.
6. Product discovery is read-only. A discovered operator/product is never automatically approved, imported as active, or offered to customers. Approval and activation remain separate explicit admin actions after sandbox acceptance.
7. The admin dashboard should show one operator approval state and the verified supported range/denominations. It should show a clear coverage warning when the provider cannot cover the full required 10–3000 range. It must not label the operator as full-range ready unless min, max, interior values, and increments have passed sandbox tests.

The read-only DT One discovery endpoint may classify products using the documented `type`, `accepted_calculation_modes`, and min/max amount metadata. Discovery results are candidates only; they do not themselves establish account-specific price-list availability or authorize a transaction.

## Ranged-value checkout: required two-phase contract

Status: implementation blocker; discovery metadata is not a checkout authorization.

The current customer checkout path resolves an exact `product_catalog.amount`, requires a stored `price_eur_cents` and `wholesale_price_eur_cents`, creates a Stripe Checkout Session, and only after canonical Stripe payment verification submits a new DT One transaction with `auto_confirm: true`. This is a fixed-denomination flow. It must not be widened to accept arbitrary values by changing the SQL amount predicate alone: doing so would reuse a stale/static catalog price and could charge the customer incorrectly.

For a verified `RANGED_VALUE_RECHARGE` product, the target flow is:

1. Resolve the selected country, stable operator key, verified provider operator/product mapping, destination currency, and the approved provider amount range from server-side records. Ignore any client-supplied provider product ID or price.
2. Validate the requested destination amount against the provider's exact minimum, maximum, and increment. Reject unsupported amounts; do not infer that every integer in 10–3000 is supported.
3. Create one DT One asynchronous transaction with a unique order `external_id`, `calculation_mode: DESTINATION_AMOUNT`, `destination: { unit_type: CURRENCY, unit: <verified destination currency>, amount: <requested amount> }`, recipient identifier, callback URL, and `auto_confirm: false`.
4. Persist the DT One transaction ID, provider state, exact quoted wholesale amount/currency, confirmation expiry, product/config version, destination amount, and a stable idempotency key before creating Stripe Checkout. A retry must retrieve/reconcile the existing reservation, never create a second transaction.
5. Convert the provider wholesale amount to EUR only using a documented, account-approved settlement currency/rate and explicit rounding policy. If DT One returns a non-EUR wholesale unit and no trusted conversion is configured, stop checkout. Never assume USD equals EUR or reuse the AFN market-comparison rate as a settlement FX rate.
6. Calculate the EUR customer charge from the verified wholesale cost plus configured app fee and Stripe fee gross-up. Persist the complete immutable quote snapshot used for the Stripe amount.
7. After Stripe's canonical paid webhook re-fetches and validates the exact session/payment intent, confirm the same saved DT One transaction ID. Never create a replacement transaction from the paid webhook.
8. If payment fails, expires, or is abandoned, cancel the still-CREATED DT One reservation where supported; if confirmation expiry has passed or provider outcome is uncertain, move the order to reconciliation review. Never retry a possibly accepted provider request blindly.
9. Reconcile callbacks and read-only status queries against the saved transaction ID and external ID. Idempotently handle duplicate/out-of-order Stripe events and DT One callbacks.

### Mandatory release gates

- Verify the actual DT One account's wholesale price currency and balance/settlement currency from account configuration or a sandbox transaction response. This is not established by the repository's current EUR pricing fields.
- Verify the exact transaction create/confirm/cancel/status endpoint version and response schema against the account-enabled DVS API.
- Add isolated tests for min/max/increment boundaries, non-EUR or missing wholesale currency, quote rounding, Stripe amount mismatch, duplicate webhook, transaction create timeout/unknown outcome, payment failure/cancel, reservation expiry, confirm retry, callback replay, and fixed-product regression.
- Run sandbox-only end-to-end tests for each supported country/operator/product mapping. Do not enable catalog rows or customer checkout until the evidence is reviewed.
- Keep the fixed-denomination path unchanged while ranged-value support is introduced behind an explicit product capability and versioned admin approval.

DT One's current public DVS documentation describes `DESTINATION_AMOUNT` for ranged products, a separate confirmation endpoint when `auto_confirm` is false, and automatic cancellation of unconfirmed CREATED transactions after 60 minutes. It recommends the two-step flow for checking ranged-product prices before confirmation. These provider rules do not establish this account's wholesale settlement currency or approve any particular country/operator mapping.
