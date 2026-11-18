# PGNT ASIAN TOPUP — multi-country platform architecture

Status: architecture plan for incremental implementation. This document does not activate a country, change live prices, import products, run migrations, or deploy production.

## Product requirement

PGNT ASIAN TOPUP must support the current launch countries and allow future countries to be added through controlled configuration and catalog onboarding—not by rewriting the app or adding country-specific conditionals throughout the codebase.

Current target markets:
- Afghanistan (+93), currency AFN
- Pakistan (+92), currency PKR
- India (+91), currency INR
- Bangladesh (+880), currency BDT

EUR remains the customer's payment and wallet display currency unless a later approved product decision changes it. A destination country's local currency is used for operator/product pricing and provider settlement where applicable.

## Core design rule: data-driven countries

Treat countries, operators, products, payment availability, calling availability and pricing as separate records. A country being present in configuration does not mean its products, top-ups, payments or calls are active.

Use stable ISO 3166-1 alpha-2 country codes as identifiers (AF, PK, IN, BD), E.164 calling codes, ISO 4217 currency codes, and stable provider/operator identifiers. Never use translated country names as database keys.

### Country configuration
Each country configuration should contain:
- country_code (unique ISO alpha-2), display_name_key (translation key), calling_code, default_local_currency
- supported_languages (optional; language availability is not country-exclusive)
- phone_number_rules / numbering metadata version
- enabled flags per capability: topup_enabled, outbound_calling_enabled, wallet_payment_enabled
- rollout_state: planned, configured, catalog_review, pricing_review, sandbox_verified, approved, active, paused, retired
- compliance_status and required KYC/consumer disclosures
- created_at, updated_at, created_by, approved_by, approved_at

Country enablement must be capability-specific. Do not infer that enabling top-ups also enables calling or payment methods.

### Operators and products
- Operators belong to a country and have stable internal IDs, localized display names, aliases, brand assets, number-prefix metadata (informational only), provider mappings and capability status.
- Products belong to a country, operator and provider product reference. Store provider wholesale cost and currency separately from customer retail price and EUR preview.
- Product imports must land disabled/pending review. Never auto-activate a newly discovered product.
- Do not identify an operator solely from a phone prefix when number portability or ambiguous ranges make that unreliable. Let customers choose/confirm the operator or use a validated lookup provider.

### Pricing and foreign exchange
- Keep local wholesale cost, local retail amount, customer EUR amount, app fee, provider fee, payment processor fee, taxes and margin as separate auditable values.
- Use an approved FX rate record with source, quote/base currencies, rate, effective_at, fetched_at, expiry/staleness policy and approver.
- Never silently reuse stale FX data or overwrite a historical transaction's applied rate.
- Every quote must include a pricing version/snapshot; a completed order must retain the exact quote and FX snapshot used.
- Admin edits require validation, audit log, maker/checker approval for production and preview impact across affected products.
- Do not hard-code a single AFN exchange rate or assume the same rate for all currencies/countries.

### Provider abstraction
- Keep DT One and future top-up providers behind a provider adapter interface. Map provider country/operator/product IDs in configuration, not in Flutter UI code.
- Keep outbound voice providers behind a separate voice adapter interface. Top-up and voice provider credentials, events and accounting must never share unsafe assumptions.
- Provider webhooks must be authenticated, replay-protected, idempotent and reconciled against provider transaction/CDR records.
- Adding a provider must not require country-specific wallet logic.

## API and app behavior

Suggested API resources:
- GET /api/public/countries — only public, approved country/capability summaries
- GET /api/public/countries/:countryCode/operators
- GET /api/public/countries/:countryCode/products
- POST /api/pricing/quote — server-calculated, versioned quote
- Admin-only country/operator/product/pricing/provider mapping endpoints with role checks and audit events

Flutter requirements:
- Fetch country/capability/catalog configuration from backend; do not maintain a separate hard-coded list as the source of truth.
- Cache the last known public configuration for graceful display, but mark stale data and require a fresh server quote before payment or call initiation.
- Use translation keys and localized names; adding a country must not require copying entire screens.
- Country selector should show only countries available for the selected capability, while planned countries can remain hidden from customers.
- Phone input must use country-specific numbering metadata and E.164 normalization; country code alone is not proof of operator or customer location.
- Support country-specific legal text, payment methods and KYC gates without branching the whole app by country.

## Adding a new country — controlled workflow

1. Create a planned country record with ISO code, calling code, currency and compliance checklist.
2. Verify legal eligibility, telecom rules, payment acceptance, sanctions/restricted destination rules, tax and consumer disclosures.
3. Configure provider coverage and obtain written operator-level tariffs and commercial terms.
4. Import products/operators as disabled records; deduplicate by provider + provider product ID.
5. Review product denomination, currency, provider cost, fees, FX source and customer EUR price.
6. Run sandbox tests for product discovery, quote, payment, provider order, callback, refund/failure handling and reconciliation.
7. Run security, fraud, wallet-ledger and concurrency tests for that country.
8. Obtain independent admin approval; activate only the relevant capability (top-up, calling, payment) with a staged rollout and kill switch.
9. Monitor success/failure rates, provider latency, margin, chargebacks, refunds and customer support; pause automatically or manually on thresholds.
10. Record who approved activation and preserve an auditable rollback path.

No new country should become customer-visible merely because a provider API returns products for it.

## Data integrity and financial safety

- Wallet ledger is currency-aware and immutable. EUR wallet entries must not be mixed with local-currency provider costs.
- Use atomic database transactions, row locks or equivalent concurrency control, idempotency keys and unique provider references.
- A transaction stores customer, country, operator, product, provider, local cost/currency, retail EUR amount, fee breakdown, FX snapshot, pricing version and final provider status.
- Refunds/reversals are new ledger entries; never edit or delete posted ledger rows.
- Enforce per-country spend limits, velocity checks, duplicate-order protection and a global kill switch.
- Keep sandbox and production credentials, databases, webhooks and catalog states isolated.

## Admin console requirements

- Country matrix showing capability, rollout state, compliance status, provider coverage and last verification.
- Country onboarding wizard with mandatory fields and evidence attachments.
- Operator/product mapping and disabled-by-default import review.
- Pricing preview showing wholesale, fees, FX, EUR retail, margin and stale-rate warnings.
- Maker/checker approvals, immutable audit trail, per-capability kill switches and rollback.
- Reports segmented by country, operator, provider, currency, product and failure reason.

## Automated quality gates

- Unit tests: ISO country/currency validation, E.164 parsing, localized display, capability gating, FX freshness and pricing calculations.
- Contract tests: provider country/operator/product mappings and unknown provider values.
- Integration tests: quote -> payment -> top-up -> callback -> ledger -> refund/reconciliation.
- Security tests: role-based admin access, webhook signature/replay protection, idempotency and cross-country data isolation.
- Regression tests: adding a new country must not alter the existing four countries' prices, catalogs, language behavior or wallet ledger.
- Migration tests: explicit, repeatable, backward-compatible migrations on isolated PostgreSQL; no automatic production migration at app startup.

## Release and governance rules

- Existing countries remain unchanged unless separately reviewed and approved.
- New country setup begins in planned/disabled state.
- Production activation, live price/FX changes, provider deposits, real calls, wallet write changes, migrations and deployment require separate explicit approval.
- All customer-facing prices are server-calculated and shown before confirmation.
- No secret, provider credential or private customer contact data belongs in Flutter assets, source control or public API responses.

## Implementation sequence

1. Inspect existing country/operator/product schema and Flutter country selectors; map current hard-coded behavior before changing it.
2. Add/complete backend country and capability configuration with backward-compatible migrations and tests.
3. Convert public catalog APIs and Flutter selectors to backend-driven configuration, retaining the current four countries as the initial configured set.
4. Move pricing/FX to auditable per-country snapshots and quote APIs.
5. Add admin onboarding, review, approvals and kill switches.
6. Add provider coverage, compliance and automated regression gates.
7. Only then onboard an additional country in sandbox and seek explicit production approval.

This plan is additive: do not rebuild the existing app, discard current country catalog work, or silently change live production behavior.
