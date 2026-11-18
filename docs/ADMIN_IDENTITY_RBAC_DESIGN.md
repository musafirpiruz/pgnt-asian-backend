# PGNT ASIAN TOPUP — Admin Identity and RBAC Design

Status: backend RBAC foundation and route guard are implemented in the feature branch; Admin Panel Firebase sign-in and production activation are not implemented.

## Security objective

Replace the shared `ADMIN_API_KEY` as the long-term admin identity with individually attributable administrator accounts and least-privilege permissions. Preserve the current fail-closed behavior while the transition is implemented. Do not expose admin endpoints publicly without authentication.

## Initial administrator count

The project owner has explicitly selected **two administrator accounts only** for the initial release:

1. **Owner:** the project owner; full administrative authority and sole authority to create, disable, or change administrator accounts and roles.
2. **Second Admin:** one additional individually named administrator; receives only the specific permissions the Owner approves.

Do not provision a third administrator account in the initial release. The specialist roles below describe permission boundaries and future extensibility; they do not mean that five separate administrator accounts must be created. The Second Admin is approved for **customer support only**. Permit only minimum necessary customer/order/top-up status viewing and support replies/escalations when those workflows are implemented. Deny catalog/network/product management, product activation, pricing/FX/fee changes, referral administration, payment reconciliation, Stripe candidate access, refunds, wallet operations, and administrator/role management.

## Roles and permissions

| Capability | Owner | Catalog reviewer | Finance operator | Support agent (Second Admin) | Read-only auditor |
|---|---:|---:|---:|---:|---:|
| Read operational overview | Yes | Yes | Yes | Yes | Yes |
| View catalog candidates and verification evidence | Yes | Yes | No | No | Yes |
| Approve one sample per operator | Yes | Yes, if delegated | No | No | No |
| Run bounded catalog verification / queue retry | Yes | Yes, if delegated | No | No | No |
| Activate country, operator, mapping, or product | Yes, separate confirmation | No | No | No | No |
| Read pricing and fee settings | Yes | Yes | Yes | No | Yes |
| Change pricing, fees, or FX settings | Yes | No | Delegated, if enabled | No | No |
| Read payment/refund reconciliation | Yes | No | Yes | Limited status only | Yes |
| Initiate refund | Yes | No | Delegated, with explicit policy | No | No |
| Read support tickets | Yes | No | No | Yes | No |
| Reply/escalate support tickets | Yes | No | No | Yes | No |
| Manage admin accounts and roles | Yes | No | No | No | No |
| View immutable admin audit history | Yes | Limited | Finance events | Support events | Yes |

All permissions are deny-by-default. Role names are not sufficient by themselves: each route must require a named permission. High-risk actions (activation, pricing changes, refunds, role changes) require explicit confirmation and an audit event containing actor ID, action, target, timestamp, request ID, and before/after evidence with secrets and personal data redacted.

## Implemented backend slice (feature branch only; not deployed)

- `admin-rbac.js` contains a fail-closed policy module that accepts only two distinct, explicitly configured Firebase UIDs: one Owner and one Support Admin.
- The module derives roles from the verified `req.auth.uid` produced by the existing Firebase token-verification middleware. It does not trust request-body roles, headers, query parameters, or unverified token claims.
- The second UID receives only `support.tickets.read` and `support.tickets.reply` for the existing support inbox endpoints. The unused `support.orders.read_limited` and `support.tickets.escalate` permissions are reserved but no route is mapped to them.
- All other identities are denied. Missing UIDs, identical UIDs, or missing Firebase middleware return a fail-closed configuration response.
- `server.js` now routes admin requests through Firebase identity/RBAC when both `ADMIN_OWNER_FIREBASE_UID` and `ADMIN_SUPPORT_FIREBASE_UID` are configured. The legacy shared-key path remains Owner-equivalent only while RBAC is not configured.
- Every admin route defaults to Owner-only. Only `GET /api/admin/support/tickets` and `PATCH /api/admin/support/tickets/:ticketId` map to Support permissions. Support ticket responses hide the customer's phone number and charge amount from the Support role.
- `tests/admin-rbac.test.js` covers configuration failure, Owner assignment, support-only assignment, unknown identity denial, named permission enforcement, Owner-only route boundaries, and empty permission rejection.
- `tests/support-routes-rbac.test.js` verifies that the support role receives redacted phone and charge fields while the Owner-equivalent migration path retains full support details.
- **Important:** the Admin Panel still uses `x-admin-api-key`; its Firebase browser sign-in is not yet implemented. Therefore do not configure the two UID environment variables on Render yet, because doing so would switch API authentication to Firebase bearer tokens and the existing Admin Panel would stop working. Do not share UIDs, credentials, or service-account JSON in chat.

## Authentication and account lifecycle

1. Provision exactly two initial identities: Owner and Second Admin. The Second Admin is assigned Support Agent permissions only. Use individually assigned admin identities; never store plaintext passwords or reusable API secrets in the database.
2. Prefer the existing trusted identity provider only after verifying issuer, audience, signature, expiry, and subject server-side. Do not trust a client-supplied email or role.
3. Store a stable provider subject ID, account status, created/updated timestamps, and role assignments. Enforce unique identity subject IDs.
4. Disabled, suspended, unknown, or unprovisioned identities are denied.
5. Owner-only provisioning and role changes must be audited. Prevent self-escalation and prevent removing the last active Owner.
6. Require MFA for Owner and Finance roles where the identity provider supports it.
7. Do not put bearer tokens, admin keys, or secrets in URLs, logs, browser local storage, or error messages.

## Route enforcement

- Replace route-level `requireAdmin` with authentication plus explicit permission middleware, e.g. `requirePermission('catalog.sample.approve')`.
- Keep customer authentication and admin authentication separate.
- Apply authorization to every admin route, including routes mounted from support modules.
- Treat unknown routes and missing permission mappings as denied.
- Use the same permission policy for API and Admin Panel navigation; hiding a button is not authorization.
- Keep provider callbacks/webhooks on their existing signature-validation paths; do not route them through human-admin authentication.

## Safe migration plan

1. Inventory every `/api/admin` route and every mounted admin router; map each to a permission. The current backend guard defaults all routes to Owner-only except the two support inbox routes.
2. Implement and test the identity-verification adapter and permission middleware without changing production behavior. Firebase identity and route-level RBAC now exist in the feature branch; the Admin Panel login flow remains outstanding.
3. Add admin identity and role tables with reversible, additive migrations; do not seed a default password or public account.
4. Add tests for missing/invalid/expired token, wrong issuer/audience, disabled account, unknown subject, missing permission, role escalation, last-owner protection, audit failure rollback, and each high-risk route.
5. Add a controlled owner-provisioning procedure using a verified identity subject. Keep the shared key as a temporary emergency compatibility path only during a documented cutover window.
6. Verify all Admin Panel API calls use the new identity flow. Then disable the shared key in a separately approved deployment.
7. Rotate and remove the legacy key from the hosting environment only after successful staging verification and owner approval.

## Release gates

- No production migration, deployment, account provisioning, key rotation, or disabling of the current key is authorized by this design document. The approved initial account count is two only; the Second Admin is support-only, and provisioning still requires a separately tested implementation and explicit Owner approval.
- Backend route-level RBAC is implemented in this feature branch, but do not call the full administrator system complete until the Admin Panel uses Firebase sign-in and all mounted admin routers have dedicated route-level integration tests.
- Do not merge or deploy solely because this document exists.
- Catalog technical verification must remain separate from activation; finance and support roles must not gain activation permissions by implication.
