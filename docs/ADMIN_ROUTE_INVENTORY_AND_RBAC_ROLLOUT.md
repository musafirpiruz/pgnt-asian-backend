# Admin Route Inventory and RBAC Rollout Plan

**Project:** PGNT ASIAN TOPUP  
**Branch:** `feature/one-product-per-operator-auto-verification`  
**Status:** design and inventory only — no role enforcement is implemented by this document.

## Purpose

Record the current administrative API surface before replacing the shared `ADMIN_API_KEY` gate with named administrator identities and least-privilege permissions. This inventory is based on the current `server.js` on this branch. Re-run it whenever routes are added or moved.

## Current authentication facts

- The current `requireAdmin` middleware compares the `x-admin-api-key` header with one configured `ADMIN_API_KEY` using `crypto.timingSafeEqual`.
- This authenticates possession of one shared secret; it does not identify an individual administrator, assign a role, support per-person revocation, or provide attributable actor identity.
- The `/admin` and `/admin-dtone-check` pages serve browser UI. The API operations they call are separately guarded by `requireAdmin`; do not treat hiding or serving an HTML page as authorization.
- Stripe webhook and DT One callback routes use provider-specific authentication/verification and must not be placed behind human-admin login middleware.
- No new administrator accounts, role assignments, production schema changes, key rotation, or deployment are authorized by this design.

## Current administrative API inventory

Every route below currently includes `requireAdmin` in its route middleware chain.

| Current route | Method | Proposed access boundary |
|---|---:|---|
| `/api/admin/stripe-dtone/sandbox-checkout` | POST | Owner only; sandbox-only and explicit confirmation |
| `/api/admin/dtone/transaction-status` | GET | Finance operator; auditor read-only |
| `/api/admin/dtone/reconcile-status` | POST | Owner or specifically authorized finance operator; reconciliation is a state-changing action |
| `/api/admin/wallets/diagnostics` | GET | Owner and auditor; restrict sensitive output |
| `/api/admin/wallets/migration-preflight` | GET | Owner and auditor; read-only |
| `/api/admin/country-operators` | GET | Catalog reviewer, Owner, auditor |
| `/api/admin/country-operators/:operatorId/catalog-candidates` | GET | Catalog reviewer, Owner, auditor |
| `/api/admin/country-operators/:operatorId/approve-sample` | POST | Owner only; approval changes verification authority |
| `/api/admin/country-operators/:operatorId/catalog-auto-verify` | POST | Owner or explicitly delegated Catalog reviewer; never activates products |
| `/api/admin/country-operators/:operatorId/catalog-retry-reviewed` | POST | Owner or explicitly delegated Catalog reviewer |
| `/api/admin/country-operators/:operatorId/catalog-batch-preview` | POST | Catalog reviewer, Owner, auditor; must remain dry-run |
| `/api/admin/referrals/codes` | POST | Owner only initially |
| `/api/admin/referrals` | GET | Owner, Support read-only only if referral data is necessary, auditor |
| `/api/admin/referrals/codes/:code` | PATCH | Owner only initially |
| `/api/admin/referrals/codes/:code` | DELETE | Owner only; prefer deactivation over destructive deletion |
| `/api/admin/dtone/products/:productId` | GET | Catalog reviewer, Owner, auditor |
| `/api/admin/catalog/:productId/refresh-prices` | POST | Owner or Finance operator; record before/after price evidence |
| `/api/admin/catalog/:productId/import` | POST | Owner or Catalog reviewer; imported products remain inactive |
| `/api/admin/dtone/catalog/sync-country` | POST | Owner or Catalog reviewer; bounded provider operation, no activation |
| `/api/admin/dtone/operators` | GET | Catalog reviewer, Owner, auditor |
| `/api/admin/dtone/products` | GET | Catalog reviewer, Owner, auditor |
| `/api/admin/dtone/ranged-products/import` | POST | Owner only until product-type policy is separately approved |
| `/api/admin/catalog/:productId/pricing` | GET | Finance operator, Owner, auditor |
| `/api/admin/operator-pricing` | GET | Finance operator, Owner, auditor |
| `/api/admin/operator-pricing/:country/:operator` | PUT | Owner or Finance operator; audit every change |
| `/api/admin/pricing` | GET | Finance operator, Owner, auditor |
| `/api/admin/pricing/:country` | PUT | Owner or Finance operator; enforce bounds and audit every change |
| `/api/admin/orders/:orderId/payment-status` | GET | Finance operator, Support read-only, Owner, auditor with minimized fields |
| `/api/admin/orders/:orderId/stripe-candidates` | GET | Owner and Finance operator only; sensitive payment metadata |
| `/api/admin/orders/review` | GET | Support read-only, Finance operator, Owner; minimize recipient data |
| `/api/admin/orders/:orderId/archive-declined-sandbox` | POST | Owner only; explicit evidence and sandbox restriction |
| `/api/admin/orders/:orderId/refund` | POST | Owner only initially; require verified final provider failure and Stripe payment |

The route inventory contains 32 administrative API route declarations in the current server file. The separate browser pages are `GET /admin` and `GET /admin-dtone-check`; their API calls remain subject to API authorization.

## Non-admin routes that must keep separate authentication

- `POST /api/stripe/webhook`: Stripe signature verification over the raw request body. Do not replace with human-admin authentication.
- `POST /api/dtone/callback`: DT One callback authentication/signature rules. Do not replace with human-admin authentication.
- `GET /api/orders/:orderId/status`: per-order access token; never grant access based only on an administrator role.
- `GET /api/referrals/validate/:code`: public referral-code validation; return only the minimum public fields.
- Customer country/operator, currency, pricing quote, and checkout routes remain customer-facing and must not accidentally inherit admin roles.

## Proposed role definitions

1. **Owner** — the project owner; full administrative authority, account lifecycle, role assignment, emergency recovery, and explicit approval of high-impact actions.
2. **Catalog reviewer** — inspect provider products, preview imports, run bounded catalog verification, and handle reviewed catalog retries. Cannot change pricing, issue refunds, activate products, or manage administrator accounts.
3. **Finance operator** — view payment/reconciliation evidence and manage approved EUR pricing/fees within configured limits. Refund authority remains Owner-only in the initial rollout.
4. **Support agent** — view the minimum order/payment/top-up status needed to answer customers. Cannot see full payment candidate data, edit prices, issue refunds, or alter catalog state.
5. **Read-only auditor** — access approved reports and audit evidence only; no mutations and no secrets.

## Mandatory authorization design

- Use named administrator identities, not a shared key, for normal human access.
- Store password hashes or use a supported identity provider; never store plaintext passwords or API secrets in the database.
- Use short-lived sessions/tokens, secure cookie settings for browser administration, CSRF protection for cookie-authenticated mutations, rate limits, and account lock/recovery controls.
- Resolve the authenticated actor server-side and enforce explicit permission identifiers at each route. UI visibility is not authorization.
- Default deny. Unknown roles, missing permissions, disabled accounts, expired sessions, and unavailable identity storage must fail closed.
- Require step-up authentication or fresh re-authentication for role changes, refunds, pricing changes, and other high-impact actions.
- Record immutable audit events with actor ID, action, target, timestamp, request/correlation ID, outcome, and redacted before/after values. Never log passwords, session tokens, API keys, or full card data.
- Preserve provider-specific webhook/callback authentication and per-order access tokens as separate trust boundaries.
- Keep an emergency Owner recovery path documented and tested before disabling the legacy shared key.

## Staged migration plan

1. **Inventory and tests (this document):** enumerate routes and classify permissions; add tests that prove every administrative route is protected and public/provider routes retain their separate auth.
2. **Identity schema and service:** design administrator, role, permission, session, and audit tables; add migrations with rollback and isolated PostgreSQL tests only.
3. **Authorization middleware:** implement explicit permission checks and actor context; test unauthenticated, disabled, wrong-role, revoked-session, CSRF, and privilege-escalation cases.
4. **Owner bootstrap:** create the first Owner through a one-time secure bootstrap flow; never seed a default password or expose a public registration endpoint.
5. **Route-by-route migration:** map every route above to a permission, migrate admin UI to secure sessions, and verify no route is omitted.
6. **Dual-control and audit review:** test refund/pricing/role-change safeguards, audit immutability, redaction, and recovery.
7. **Staging validation:** verify with a staging database and separate test accounts for all five roles.
8. **Owner approval:** only after staging evidence is reviewed may production migration, key rotation, and deployment be proposed. These actions require separate explicit authorization.

## Acceptance criteria

- Every `/api/admin/*` route has a named permission and a route-level authorization test.
- Every mutating admin route rejects missing, disabled, expired, and insufficiently privileged identities.
- Support and auditor roles cannot invoke catalog, pricing, referral mutation, or refund actions.
- Catalog reviewer cannot change fees, FX rates, payment records, or refund orders.
- Finance operator cannot manage users/roles or approve provider operator identity anchors.
- Owner-only actions have audit evidence and explicit confirmation where required.
- Stripe and DT One provider callbacks continue to use their own signature/authentication mechanisms.
- No product activation, payment, refund, top-up, or calling action is introduced by the RBAC migration itself.

## Current limitations

This is a source-code inventory and rollout design, not an implemented RBAC system. The existing shared `ADMIN_API_KEY` remains the active administrative authentication mechanism until a separately tested implementation is approved and deployed. Live DT One validation and production access were not performed while preparing this document.
