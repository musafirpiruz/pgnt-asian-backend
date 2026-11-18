# PGNT ASIAN TOPUP — Admin Identity and RBAC Design

Status: design only; no admin accounts or permissions are enabled by this document.

## Security objective

Replace the shared `ADMIN_API_KEY` as the long-term admin identity with individually attributable administrator accounts and least-privilege permissions. Preserve the current fail-closed behavior while the transition is implemented. Do not expose admin endpoints publicly without authentication.

## Initial administrator count

The project owner has explicitly selected **two administrator accounts only** for the initial release:

1. **Owner:** the project owner; full administrative authority and sole authority to create, disable, or change administrator accounts and roles.
2. **Second Admin:** one additional individually named administrator; receives only the specific permissions the Owner approves.

Do not provision a third administrator account in the initial release. The specialist roles below describe permission boundaries and future extensibility; they do not mean that five separate administrator accounts must be created. The Second Admin's precise duties remain subject to Owner confirmation. Until confirmed, apply least privilege and do not grant account/role management, refunds, product activation, or changes to fees/FX.

## Roles and permissions

| Capability | Owner | Catalog reviewer | Finance operator | Support agent | Read-only auditor |
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

## Authentication and account lifecycle

1. Provision exactly two initial identities: Owner and Second Admin. Use individually assigned admin identities; never store plaintext passwords or reusable API secrets in the database.
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

1. Inventory every `/api/admin` route and every mounted admin router; map each to a permission.
2. Implement and test the identity-verification adapter and permission middleware without changing production behavior.
3. Add admin identity and role tables with reversible, additive migrations; do not seed a default password or public account.
4. Add tests for missing/invalid/expired token, wrong issuer/audience, disabled account, unknown subject, missing permission, role escalation, last-owner protection, audit failure rollback, and each high-risk route.
5. Add a controlled owner-provisioning procedure using a verified identity subject. Keep the shared key as a temporary emergency compatibility path only during a documented cutover window.
6. Verify all Admin Panel API calls use the new identity flow. Then disable the shared key in a separately approved deployment.
7. Rotate and remove the legacy key from the hosting environment only after successful staging verification and owner approval.

## Release gates

- No production migration, deployment, account provisioning, key rotation, or disabling of the current key is authorized by this design document. The approved initial account count is two only; provisioning still requires a separately tested implementation and explicit Owner approval.
- Do not claim RBAC is implemented until all admin routes and mounted routers enforce tested permissions.
- Do not merge or deploy solely because this document exists.
- Catalog technical verification must remain separate from activation; finance and support roles must not gain activation permissions by implication.
