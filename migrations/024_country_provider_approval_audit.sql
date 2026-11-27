-- Approval/audit foundation for extensible provider onboarding.
-- Approval never changes country/operator/product activation flags.
BEGIN;

CREATE TABLE IF NOT EXISTS country_operator_approvals (
  id BIGSERIAL PRIMARY KEY,
  operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE RESTRICT,
  sample_product_catalog_id BIGINT NOT NULL REFERENCES product_catalog(id) ON DELETE RESTRICT,
  provider VARCHAR(32) NOT NULL,
  provider_operator_id VARCHAR(80) NOT NULL,
  provider_product_id VARCHAR(80) NOT NULL,
  destination_currency CHAR(3) NOT NULL CHECK (destination_currency ~ '^[A-Z]{3}$'),
  product_type VARCHAR(48) NOT NULL,
  denomination NUMERIC(18,4) NOT NULL CHECK (denomination > 0),
  retail_price_eur_cents INTEGER NOT NULL CHECK (retail_price_eur_cents > 0),
  wholesale_price_eur_cents INTEGER NOT NULL CHECK (wholesale_price_eur_cents > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved','revoked')),
  verified_by VARCHAR(160) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by VARCHAR(160),
  revoked_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (retail_price_eur_cents >= wholesale_price_eur_cents),
  CHECK (
    (status = 'approved' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

-- Exactly one current sample approval per operator. Historical revoked
-- approvals remain available for audit and later re-approval.
CREATE UNIQUE INDEX IF NOT EXISTS uq_country_operator_current_sample_approval
  ON country_operator_approvals(operator_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_country_operator_approvals_history
  ON country_operator_approvals(operator_id, verified_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS catalog_verification_audit (
  id BIGSERIAL PRIMARY KEY,
  operator_id BIGINT REFERENCES country_operators(id) ON DELETE RESTRICT,
  product_catalog_id BIGINT REFERENCES product_catalog(id) ON DELETE RESTRICT,
  event_type VARCHAR(48) NOT NULL CHECK (event_type IN (
    'sample_approved','sample_revoked','product_verified',
    'product_rejected','batch_previewed','batch_applied'
  )),
  actor_type VARCHAR(24) NOT NULL CHECK (actor_type IN ('admin_user','admin_api_key','system')),
  actor_id VARCHAR(160) NOT NULL,
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('success','rejected','preview')),
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_verification_audit_operator
  ON catalog_verification_audit(operator_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_verification_audit_product
  ON catalog_verification_audit(product_catalog_id, created_at DESC, id DESC);

COMMIT;
