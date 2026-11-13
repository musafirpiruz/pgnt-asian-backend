# Country Registry Runtime Rollout Guardrails

## Current implementation boundary

The backend still imports `COUNTRY_CURRENCIES` and `SUPPORTED_COUNTRIES` from `country-config.js` for synchronous checkout, phone validation, and historical fulfillment paths. The database registry is used by customer catalog discovery, but it is not yet the authoritative runtime allowlist for every order path.

`country-registry.js` validates and loads only rows whose status is `active`. `country-registry-runtime.js` provides an atomic in-process snapshot manager:
- no snapshot is exposed before the first successful load;
- concurrent refreshes share one in-flight load;
- a failed refresh does not replace the last known-good snapshot;
- the refresh timestamp is published together with the complete snapshot.

The runtime manager is intentionally not wired into `server.js` yet. It is a building block, not a switch that can safely replace the static configuration.

## Why activation is blocked for now

Migration 023 seeds AF, PK, IN, and BD with status `legacy`. It also leaves operator and product mappings inactive and unverified. Therefore, replacing the static allowlist with the active database snapshot now would reject existing countries. Conversely, automatically promoting legacy rows to active would expose catalog entries without provider verification.

Historical order fulfillment also reads the static country configuration. A country being disabled in the future must prevent new orders without breaking already-paid orders, callbacks, refunds, or status lookups.

## Required gates before server integration

1. Define a versioned runtime contract that distinguishes legacy checkout compatibility from new-country activation.
2. Keep historical order fulfillment independent of the current country activation state. Persist the country calling code, destination currency, provider identity, and other fulfillment-critical values on each order (or prove an equivalent immutable snapshot already exists).
3. Resolve synchronous phone/country validation without introducing asynchronous database reads into request validation paths.
4. Ensure the country API, operator API, product lookup, checkout creation, Stripe webhook, DT One callback, refund and support flows use consistent activation/version rules.
5. Ensure an empty, unavailable, malformed, or stale registry cannot silently fall back to an unsafe country set for new orders.
6. Add integration tests for legacy four-country behavior, a draft fifth country, activation, disablement, in-flight orders, old callbacks, and process restart.
7. Verify production database migration order and existing data in a read-only preflight before any rollout.

## Operational policy

- Do not mark any country active as part of a migration or deployment.
- Do not import or enable DT One products automatically.
- Do not change live FX, fee, margin, or EUR customer prices as part of registry rollout.
- Do not apply migrations to production, merge, deploy, or run real payment/top-up transactions without explicit owner approval.
- Keep this rollout additive and reversible; never rebuild the existing application from scratch.

## Current status

The registry loader and snapshot manager are implemented with isolated unit tests. The server integration, admin activation workflow, immutable historical-order country snapshot, and production rollout gates remain incomplete. Passing unit tests alone does not mean country onboarding is production-ready.
