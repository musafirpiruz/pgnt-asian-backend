-- Isolated PostgreSQL integration test for exact DT One product identity.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/product-identity-027.integration.sql

CREATE SCHEMA product_identity_027_test;
SET search_path TO product_identity_027_test, public;

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
VALUES
  ('AF', 'Afghan Wireless', 100, 'AFN', 10001),
  ('AF', 'Roshan', 50, 'AFN', 10002);

\ir ../migrations/026_product_provider_metadata_foundation.sql
\ir ../migrations/027_product_identity_uniqueness.sql

DO $$
DECLARE
  duplicate_provider_id_rejected BOOLEAN := FALSE;
  product_count INTEGER;
  legacy_unique_exists BOOLEAN;
  browse_index_exists BOOLEAN;
BEGIN
  INSERT INTO product_catalog(country, operator, amount, currency, product_id, provider_product_name, active)
  VALUES ('AF', 'Afghan Wireless', 100, 'AFN', 10003, '100 AFN data bundle', FALSE);

  SELECT COUNT(*) INTO product_count
  FROM product_catalog
  WHERE country = 'AF' AND operator = 'Afghan Wireless'
    AND amount = 100 AND currency = 'AFN';
  IF product_count <> 2 THEN
    RAISE EXCEPTION 'Expected two distinct products with same denomination, found %', product_count;
  END IF;

  BEGIN
    INSERT INTO product_catalog(country, operator, amount, currency, product_id)
    VALUES ('AF', 'Different operator', 100, 'AFN', 10003);
  EXCEPTION WHEN unique_violation THEN
    duplicate_provider_id_rejected := TRUE;
  END;
  IF NOT duplicate_provider_id_rejected THEN
    RAISE EXCEPTION 'Duplicate DT One provider product ID was accepted';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'product_catalog'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY k.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['country', 'operator', 'amount', 'currency']::name[]
  ) INTO legacy_unique_exists;
  IF legacy_unique_exists THEN
    RAISE EXCEPTION 'Legacy denomination uniqueness still exists after migration';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'product_catalog'
      AND indexname = 'idx_product_catalog_country_operator_amount_currency'
      AND indexdef NOT ILIKE 'CREATE UNIQUE INDEX%'
  ) INTO browse_index_exists;
  IF NOT browse_index_exists THEN
    RAISE EXCEPTION 'Expected non-unique product browse index is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM product_catalog WHERE active = TRUE) THEN
    RAISE EXCEPTION 'Identity migration unexpectedly activated products';
  END IF;
END;
$$;

RESET search_path;
DROP SCHEMA product_identity_027_test CASCADE;
