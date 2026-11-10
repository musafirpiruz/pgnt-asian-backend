-- Canonical destination-currency FX observations.
-- Forward-only schema addition. Existing pricing_settings rates are preserved;
-- no observation is imported or approved automatically.
BEGIN;

DO $$
BEGIN
  IF to_regclass(current_schema() || '.country_registry') IS NULL THEN
    RAISE EXCEPTION 'Migration 024 requires canonical country_registry (run migration 023 first)';
  END IF;
  IF to_regclass(current_schema() || '.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Migration 024 requires schema_migrations';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS country_fx_rates (
  id BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL
    REFERENCES country_registry(country_code) ON DELETE RESTRICT,
  base_currency CHAR(3) NOT NULL DEFAULT 'EUR'
    CHECK (base_currency = 'EUR'),
  quote_currency CHAR(3) NOT NULL
    CHECK (quote_currency ~ '^[A-Z]{3}$'),
  quote_per_base NUMERIC(20,10) NOT NULL
    CHECK (quote_per_base > 0),
  source VARCHAR(120) NOT NULL,
  source_reference TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > observed_at),
  CHECK (
    (is_approved = FALSE AND approved_at IS NULL)
    OR
    (is_approved = TRUE AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_country_fx_rates_lookup
  ON country_fx_rates(country_code, base_currency, quote_currency, observed_at DESC)
  WHERE is_approved = TRUE;

INSERT INTO schema_migrations(version)
VALUES ('024_country_fx_rates')
ON CONFLICT(version) DO NOTHING;

COMMIT;
