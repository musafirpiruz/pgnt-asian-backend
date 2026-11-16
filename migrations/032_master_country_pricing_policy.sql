-- Version 032: versioned country-neutral master pricing policy and immutable preview runs.
-- No live pricing settings, product prices, activation flags, orders or payments are changed.
BEGIN;

CREATE TABLE IF NOT EXISTS master_pricing_policies (
  id BIGSERIAL PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE CHECK (version > 0),
  payment_currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (payment_currency = 'EUR'),
  fee_eur_cents INTEGER NOT NULL CHECK (fee_eur_cents BETWEEN 0 AND 100000),
  stripe_fee_percent NUMERIC(7,4) NOT NULL CHECK (stripe_fee_percent >= 0 AND stripe_fee_percent < 100),
  stripe_fixed_fee_cents INTEGER NOT NULL CHECK (stripe_fixed_fee_cents BETWEEN 0 AND 10000),
  bonus_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (bonus_percent = 0),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','superseded')),
  created_by VARCHAR(120) NOT NULL,
  approved_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  CHECK (BTRIM(created_by) <> ''),
  CHECK ((status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
      OR status <> 'approved')
);

CREATE UNIQUE INDEX IF NOT EXISTS master_pricing_one_approved_policy
  ON master_pricing_policies(status) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS country_pricing_preview_runs (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT NOT NULL REFERENCES master_pricing_policies(id) ON DELETE RESTRICT,
  country_code CHAR(2) NOT NULL CHECK (country_code IN ('AF','PK','IN','BD')),
  destination_currency CHAR(3) NOT NULL CHECK (destination_currency IN ('AFN','PKR','INR','BDT')),
  fx_rate_id BIGINT,
  product_count INTEGER NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview JSONB NOT NULL,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (BTRIM(created_by) <> '')
);

CREATE INDEX IF NOT EXISTS country_pricing_preview_policy_idx
  ON country_pricing_preview_runs(policy_id, created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('032_master_country_pricing_policy')
ON CONFLICT (version) DO NOTHING;

COMMIT;
