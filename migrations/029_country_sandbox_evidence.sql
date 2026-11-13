-- PGNT ASIAN TOPUP: administrator-reviewed sandbox evidence.
-- Evidence is country-scoped, expires from readiness checks after 30 days,
-- and is never sufficient by itself to activate a country.
BEGIN;
CREATE TABLE IF NOT EXISTS country_sandbox_evidence (
  id BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE RESTRICT,
  test_name VARCHAR(40) NOT NULL CHECK (test_name IN (
    'providerConnectivity','sampleQuote','successCallback','failureCallback'
  )),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_ref VARCHAR(500) NOT NULL,
  verified_by VARCHAR(120) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(country_code,test_name),
  CHECK (BTRIM(evidence_ref) <> ''),
  CHECK (BTRIM(verified_by) <> '')
);
CREATE INDEX IF NOT EXISTS country_sandbox_evidence_verified_at_idx
  ON country_sandbox_evidence(country_code,verified_at DESC);
COMMIT;
