-- Support escalation inbox: separate, auditable handoff from support to owner.
CREATE TABLE IF NOT EXISTS support_ticket_escalations (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
  escalated_by_uid TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_uid TEXT,
  CHECK (
    (status = 'pending' AND acknowledged_at IS NULL AND acknowledged_by_uid IS NULL)
    OR
    (status IN ('acknowledged', 'resolved') AND acknowledged_at IS NOT NULL AND acknowledged_by_uid IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_escalations_owner_inbox
  ON support_ticket_escalations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_escalations_ticket
  ON support_ticket_escalations(ticket_id, created_at DESC);
