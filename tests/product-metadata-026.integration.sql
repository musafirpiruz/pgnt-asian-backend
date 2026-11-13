-- Isolated PostgreSQL integration test for the unshipped product metadata proposal.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/product-metadata-026.integration.sql

CREATE SCHEMA product_metadata_026_test;
SET search_path TO product_metadata_026_test, public;

CREATE TABLE product_catalog (
  id BIGSERIAL PRIMARY KEY,
  country CHAR(2) NOT NULL,
  operator VARCHAR(100) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  product_id BIGINT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (country, operator, amount, currency)
);

INSERT INTO product_catalog(country, operator, amount, currency, product_id)
VALUES ('AF', 'Afghan Wireless', 100, 'AFN', 10001);

\ir ../migrations/026_product_provider_metadata_foundation.sql

DO $$
DECLARE
  metadata_columns INTEGER;
  legacy_constraint_exists BOOLEAN;
  rejected_duplicate BOOLEAN := FALSE;
  stored_product_id BIGINT;
BEGIN
  SELECT COUNT(*) INTO metadata_columns
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'product_catalog'
    AND column_name IN (
      'provider_product_name',
      'provider_service_name',
      'provider_subservice_name',
      'provider_product_type',
      'provider_details',
      'provider_details_retrieved_at',
      'provider_details_source'
    );
  IF metadata_columns <> 7 THEN
    RAISE EXCEPTION 'Expected all seven provider metadata columns, found %', metadata_columns;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'product_catalog'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%country, operator, amount, currency%'
  ) INTO legacy_constraint_exists;
  IF NOT legacy_constraint_exists THEN
    RAISE EXCEPTION 'Additive metadata migration unexpectedly removed the legacy unique constraint';
  END IF;

  UPDATE product_catalog
  SET provider_product_name = 'Example data bundle',
      provider_service_name = 'Data',
      provider_subservice_name = 'Daily',
      provider_product_type = 'FIXED_VALUE_RECHARGE',
      provider_details = '{"id":10001,"type":"FIXED_VALUE_RECHARGE"}'::jsonb,
      provider_details_retrieved_at = NOW(),
      provider_details_source = 'dtone_authenticated_detail'
  WHERE product_id = 10001;

  SELECT product_id INTO stored_product_id
  FROM product_catalog
  WHERE product_id = 10001
    AND provider_product_type = 'FIXED_VALUE_RECHARGE'
    AND provider_details->>'id' = '10001';

  IF stored_product_id IS DISTINCT FROM 10001 THEN
    RAISE EXCEPTION 'Existing provider product row or metadata was not preserved';
  END IF;

  -- This draft migration is deliberately additive: a second provider product
  -- with the same legacy denomination must remain blocked until the separate,
  -- reviewed constraint-removal migration and seed changes are ready.
  BEGIN
    INSERT INTO product_catalog(country, operator, amount, currency, product_id)
    VALUES ('AF', 'Afghan Wireless', 100, 'AFN', 10002);
  EXCEPTION WHEN unique_violation THEN
    rejected_duplicate := TRUE;
  END;

  IF NOT rejected_duplicate THEN
    RAISE EXCEPTION 'Legacy denomination collision was unexpectedly accepted before the dedicated migration';
  END IF;
END;
$$;

RESET search_path;
DROP SCHEMA product_metadata_026_test CASCADE;
