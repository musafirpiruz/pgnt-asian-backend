-- Isolated PostgreSQL integration test for country registry bootstrap 023
-- and canonical EUR-to-destination FX schema 024.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/country-registry-fx-023-024.integration.sql

CREATE SCHEMA country_registry_fx_023_024_test;
-- Keep this fixture fully isolated: falling back to public can make CREATE TABLE IF NOT EXISTS
-- reuse unrelated legacy tables and invalidate the schema-shape assertions below.
SET search_path TO country_registry_fx_023_024_test;

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
\ir ../migrations/024_country_fx_rates.sql

DO $$
DECLARE
  country_count INTEGER;
  localization_count INTEGER;
  operator_count INTEGER;
  mapping_count INTEGER;
  active_operator_count INTEGER;
  active_mapping_count INTEGER;
  fx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO country_count FROM country_registry;
  SELECT COUNT(*) INTO localization_count FROM country_localizations;
  SELECT COUNT(*) INTO operator_count FROM country_operators;
  SELECT COUNT(*) INTO mapping_count FROM country_operator_products;
  SELECT COUNT(*) INTO active_operator_count FROM country_operators WHERE active OR verified_at IS NOT NULL;
  SELECT COUNT(*) INTO active_mapping_count FROM country_operator_products WHERE active OR verified_at IS NOT NULL;
  SELECT COUNT(*) INTO fx_count FROM country_fx_rates;
  IF country_count <> 4 THEN RAISE EXCEPTION 'Expected four countries, got %', country_count; END IF;
  IF localization_count <> 24 THEN RAISE EXCEPTION 'Expected 24 localizations, got %', localization_count; END IF;
  IF operator_count <> 4 OR mapping_count <> 4 THEN
    RAISE EXCEPTION 'Expected four inactive operators and mappings, got operators %, mappings %', operator_count, mapping_count;
  END IF;
  IF active_operator_count <> 0 OR active_mapping_count <> 0 THEN
    RAISE EXCEPTION 'Bootstrap activated or verified an operator/product mapping';
  END IF;
  IF fx_count <> 0 THEN RAISE EXCEPTION 'FX schema must not import or approve rates'; END IF;
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='024_country_fx_rates') THEN
    RAISE EXCEPTION 'Migration 024 was not recorded';
  END IF;
END $$;

-- A second application must be idempotent and must preserve the seeded rows.
\ir ../migrations/023_current_catalog_country_registry_bootstrap.sql
\ir ../migrations/024_country_fx_rates.sql

DO $$
DECLARE
  country_count INTEGER;
  localization_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO country_count FROM country_registry;
  SELECT COUNT(*) INTO localization_count FROM country_localizations;
  IF country_count <> 4 OR localization_count <> 24 THEN
    RAISE EXCEPTION 'Reapplying 023/024 changed canonical registry counts';
  END IF;
END $$;

-- Mismatched quote currencies must be rejected by the composite foreign key.
DO $$
DECLARE rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO country_fx_rates(country_code,base_currency,quote_currency,quote_per_base,source,observed_at,expires_at)
    VALUES ('AF','EUR','PKR',300,'test-fixture',NOW(),NOW()+INTERVAL '1 day');
  EXCEPTION WHEN foreign_key_violation THEN
    rejected := TRUE;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'FX observation with mismatched country currency was accepted'; END IF;
END $$;

RESET search_path;
DROP SCHEMA country_registry_fx_023_024_test CASCADE;

-- Backward-compatibility fixture for the live PGNT pricing schema, whose
-- destination FX column is still named afn_per_eur for all four countries.
CREATE SCHEMA country_registry_fx_legacy_023_024_test;
SET search_path TO country_registry_fx_legacy_023_024_test;

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE pricing_settings (
  country CHAR(2) PRIMARY KEY,
  afn_per_eur NUMERIC(20,10) NOT NULL CHECK (afn_per_eur > 0)
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

INSERT INTO pricing_settings(country, afn_per_eur)
VALUES ('AF', 60), ('PK', 300), ('IN', 90), ('BD', 130);
INSERT INTO product_catalog(country,operator,amount,currency,product_id,active)
VALUES
 ('AF','Network A',100,'AFN',20001,FALSE),
 ('PK','Network B',100,'PKR',20002,FALSE),
 ('IN','Network C',100,'INR',20003,FALSE),
 ('BD','Network D',100,'BDT',20004,FALSE);

\ir ../migrations/023_current_catalog_country_registry_bootstrap.sql
\ir ../migrations/024_country_fx_rates.sql

DO $legacy$
DECLARE country_count INTEGER; operator_count INTEGER; mapping_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO country_count FROM country_registry;
  SELECT COUNT(*) INTO operator_count FROM country_operators;
  SELECT COUNT(*) INTO mapping_count FROM country_operator_products;
  IF country_count <> 4 OR operator_count <> 4 OR mapping_count <> 4 THEN
    RAISE EXCEPTION 'Legacy FX schema bootstrap counts differ: countries %, operators %, mappings %',
      country_count, operator_count, mapping_count;
  END IF;
END $legacy$;

RESET search_path;
DROP SCHEMA country_registry_fx_legacy_023_024_test CASCADE;
