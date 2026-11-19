# Support escalation workflow

This workflow extends the existing customer support ticket system. It does not change payment, refund, wallet, top-up, or product activation behavior.

## Roles

- Support Admin can read support tickets, reply to customers, and create a separate escalation for Owner review.
- Owner can read the escalation inbox, acknowledge a pending escalation, and mark a pending or acknowledged escalation as resolved.
- Owner-only escalation lifecycle endpoints remain default-deny for Support Admin.

## Lifecycle

1. Support Admin submits `POST /api/admin/support/tickets/:ticketId/escalate`.
2. The backend records the verified administrator UID, note, and pending status in `support_ticket_escalations`; the ticket is marked urgent.
3. Owner sees the latest escalation in the support ticket list.
4. Owner acknowledges it through `POST /api/admin/support/escalations/:escalationId/acknowledge`.
5. Owner resolves it through `POST /api/admin/support/escalations/:escalationId/resolve`.

Acknowledgement and resolution record the verified Owner UID and timestamp. The database check constraint requires actor and timestamp fields for acknowledged/resolved rows. A partial unique index permits only one pending escalation per ticket.

## Deployment and verification

- Migration: `026_support_ticket_escalation_inbox.sql`, registered in `migrate.js`.
- Run the normal backend syntax and test workflows before merge.
- Apply the migration only through the approved deployment/migration process.
- This implementation provides an in-panel Owner inbox; it does not send email or push notifications.
- Do not merge, deploy, run production migrations, or activate production functions without explicit Owner approval.
