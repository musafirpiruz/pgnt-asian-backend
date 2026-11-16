-- Version 036: audited admin approval foundation for the four-country EUR 0.49 app fee.
-- Live fees are NOT changed by deployment. An authenticated Admin Panel approval
-- performs the four-row update atomically and records the acting admin.
BEGIN;

CREATE TABLE IF NOT EXISTS country_pricing_fee_audit (
  id BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL CHECK (country_code IN ('AF','PK','IN','BD')),
  previous_fee_eur_cents INTEGER NOT NULL CHECK (previous_fee_eur_cents >= 0),
  new_fee_eur_cents INTEGER NOT NULL CHECK (new_fee_eur_cents >= 0),
  changed_by VARCHAR(120) NOT NULL CHECK (BTRIM(changed_by) <> ''),
  change_reason TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_country_pricing_fee_audit_country_time
  ON country_pricing_fee_audit(country_code, changed_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('036_four_country_app_fee_eur_049')
ON CONFLICT (version) DO NOTHING;

COMMIT;
