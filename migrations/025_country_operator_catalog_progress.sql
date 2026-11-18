-- Durable server-side cursor for operator catalog verification.
-- Progress is scoped to the current approved sample and never changes activation.
BEGIN;
ALTER TABLE catalog_verification_audit
  DROP CONSTRAINT IF EXISTS catalog_verification_audit_event_type_check;
ALTER TABLE catalog_verification_audit
  ADD CONSTRAINT catalog_verification_audit_event_type_check CHECK (event_type IN (
    'sample_approved','sample_revoked','product_verified','product_rejected',
    'batch_previewed','batch_applied','product_retry_queued'
  ));
CREATE TABLE IF NOT EXISTS country_operator_catalog_verification_progress (
  operator_id BIGINT PRIMARY KEY REFERENCES country_operators(id) ON DELETE RESTRICT,
  approval_id BIGINT NOT NULL REFERENCES country_operator_approvals(id) ON DELETE RESTRICT,
  last_processed_product_catalog_id BIGINT NOT NULL DEFAULT 0 CHECK (last_processed_product_catalog_id >= 0),
  pages_completed INTEGER NOT NULL DEFAULT 0 CHECK (pages_completed >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_country_operator_catalog_progress_approval
  ON country_operator_catalog_verification_progress(approval_id);
COMMIT;
