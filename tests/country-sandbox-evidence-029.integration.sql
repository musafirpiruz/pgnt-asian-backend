-- Isolated PostgreSQL integration test for migration 029.
-- Exercises the approval constraint and confirms evidence review never activates a country.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/country-sandbox-evidence-029.integration.sql

CREATE SCHEMA country_sandbox_evidence_029_test;
SET search_path TO country_sandbox_evidence_029_test, public;

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE pricing_settings (
  country CHAR(2) PRIMARY KEY,
  local_currency_per_eur NUMERIC(20,10) NOT NULL CHECK (local_currency_per_eur > 0)
);
CREATE TABLE product_catalog (
  id BIGSERIAL PRIMARY KEY,
  country CHAR(2) NOT NULL,
  operator VARCHAR(100) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  product_id BIGINT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO pricing_settings(country, local_currency_per_eur)
VALUES ('AF', 60), ('PK', 300), ('IN', 90), ('BD', 130);
INSERT INTO product_catalog(country,operator,amount,currency,product_id,active)
VALUES
 ('AF','Network A',100,'AFN',10001,FALSE),
 ('PK','Network B',100,'PKR',10002,FALSE),
 ('IN','Network C',100,'INR',10003,FALSE),
 ('BD','Network D',100,'BDT',10004,FALSE);

\ir ../migrations/023_current_catalog_country_registry_bootstrap.sql
\ir ../migrations/029_country_sandbox_evidence.sql

DO $$
DECLARE rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO country_sandbox_evidence(
      country_code,test_name,passed,evidence_ref,review_status
    ) VALUES ('AF','providerConnectivity',TRUE,'fixture://missing-review','approved');
  EXCEPTION WHEN check_violation THEN
    rejected := TRUE;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Migration 029 accepted approved evidence without reviewer metadata';
  END IF;
END $$;

INSERT INTO country_sandbox_evidence(
  country_code,test_name,passed,evidence_ref,submitted_by,review_status
) VALUES (
  'AF','providerConnectivity',TRUE,'fixture://provider-connectivity','ci-test-reviewee','submitted'
);

UPDATE country_sandbox_evidence
SET review_status='approved',
    verified_at=NOW(),
    reviewed_by='independent-ci-reviewer',
    reviewed_at=NOW()
WHERE country_code='AF' AND test_name='providerConnectivity';

DO $$
DECLARE evidence_count INTEGER; country_status TEXT; active_operators INTEGER; active_mappings INTEGER;
BEGIN
  SELECT COUNT(*) INTO evidence_count
    FROM country_sandbox_evidence
   WHERE country_code='AF' AND review_status='approved'
     AND verified_at IS NOT NULL AND reviewed_by='independent-ci-reviewer'
     AND reviewed_at IS NOT NULL;
  IF evidence_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one independently approved evidence row, got %', evidence_count;
  END IF;

  SELECT status INTO country_status FROM country_registry WHERE country_code='AF';
  SELECT COUNT(*) INTO active_operators FROM country_operators WHERE country_code='AF' AND active=TRUE;
  SELECT COUNT(*) INTO active_mappings FROM country_operator_products WHERE country_code='AF' AND active=TRUE;
  IF country_status <> 'legacy' OR active_operators <> 0 OR active_mappings <> 0 THEN
    RAISE EXCEPTION 'Evidence review unexpectedly activated country/operator/product';
  END IF;
END $$;

-- Evidence is one current record per country/test; a duplicate must be rejected.
DO $$
DECLARE rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO country_sandbox_evidence(
      country_code,test_name,passed,evidence_ref,submitted_by
    ) VALUES ('AF','providerConnectivity',TRUE,'fixture://duplicate','ci-test-reviewee');
  EXCEPTION WHEN unique_violation THEN
    rejected := TRUE;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Duplicate country/test evidence was accepted';
  END IF;
END $$;

-- Reapplying the migration must be harmless on this clean schema.
\ir ../migrations/029_country_sandbox_evidence.sql

RESET search_path;
DROP SCHEMA country_sandbox_evidence_029_test CASCADE;
