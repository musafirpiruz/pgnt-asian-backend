# Extensible country onboarding contract

## Design rule

A country is configuration data, not a country-specific code branch. The
PostgreSQL `country_registry` is the runtime source of truth. The pure
`country-definition.js` validator checks proposed configuration before an
admin/import workflow persists it.

## Required country configuration

- ISO 3166-1 alpha-2 country code (unique)
- Display name
- ISO 4217 destination currency
- International calling code
- Minimum and maximum national mobile-number digits
- Explicit provider key and provider country code (never inferred from a name)
- At least one explicit supported language code

The validator rejects malformed values and duplicate country codes. It does
not call DT One, write to PostgreSQL, create products, enable a country, or
activate a provider mapping.

## Onboarding lifecycle

1. Draft: collect country metadata and translations.
2. Provider mapping: verify the authoritative provider country and operator
   identifiers from provider records.
3. Catalog review: import candidates as disabled; verify each product's
   country, operator ID, product ID, currency, type, denomination and EUR
   retail/wholesale prices.
4. Testing: run country-specific phone, quote, checkout, callback and refund
   tests in the provider sandbox.
5. Approval: record the authenticated admin actor, timestamp and evidence.
6. Activation: a separate explicit admin action after all checks pass.

A country can be configured without being active. Operator activation,
product-mapping activation and product activation are separate gates.

## Adding future countries

A future market (for example Ghana) should be added by supplying a new
validated country definition, translations, provider mapping and catalog
records. No existing country's currency, phone rules, products or pricing
must be rewritten. The example in the automated tests is synthetic test data,
not a claim that DT One currently supports that market.

## Current limitations

This PR adds the reusable validation contract and tests only. Runtime API
integration, persisted approval/audit workflow, bounded provider discovery,
PostgreSQL approval integration tests and admin UI remain separate tasks.
No country is activated by this validator.
