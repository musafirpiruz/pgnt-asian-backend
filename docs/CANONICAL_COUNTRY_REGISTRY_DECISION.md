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
