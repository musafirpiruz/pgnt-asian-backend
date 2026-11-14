-- PGNT ASIAN TOPUP: country registry administrative audit trail.
-- This migration adds audit storage only; it never changes country activation.
BEGIN;

CREATE TABLE IF NOT EXISTS country_registry_audit (
  id BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE RESTRICT,
  actor VARCHAR(120) NOT NULL,
  action VARCHAR(40) NOT NULL CHECK (action IN ('configuration_updated','status_transition')),
  previous_version INTEGER NOT NULL CHECK (previous_version > 0),
  new_version INTEGER NOT NULL CHECK (new_version > previous_version),
  old_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (BTRIM(actor) <> '')
);

CREATE INDEX IF NOT EXISTS country_registry_audit_country_created_idx
  ON country_registry_audit(country_code, created_at DESC, id DESC);

INSERT INTO schema_migrations(version)
VALUES ('030_country_registry_audit_trail')
ON CONFLICT (version) DO NOTHING;

COMMIT;
