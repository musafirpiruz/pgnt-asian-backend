-- PGNT ASIAN TOPUP: product identity uniqueness migration.
-- REVIEW ONLY: intentionally not wired into migrate.js and not applied to any database.
-- Precondition: customer quote/checkout use exact product_catalog.id, and seed
-- upserts target the unique DT One product_id. Do not apply before reviewing
-- a production backup and all catalog/reporting query paths.

BEGIN;

DO $$
DECLARE
  target_constraint RECORD;
  dropped_count INTEGER := 0;
BEGIN
  IF to_regclass('product_catalog') IS NULL THEN
    RAISE EXCEPTION 'product_catalog is missing; refusing product identity migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    WHERE t.oid = 'product_catalog'::regclass
      AND i.indisunique
      AND a.attname = 'product_id'
  ) THEN
    RAISE EXCEPTION 'product_catalog.product_id must remain unique before removing legacy denomination uniqueness';
  END IF;

  FOR target_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'product_catalog'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY k.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['country', 'operator', 'amount', 'currency']::name[]
  LOOP
    EXECUTE format(
      'ALTER TABLE product_catalog DROP CONSTRAINT %I',
      target_constraint.conname
    );
    dropped_count := dropped_count + 1;
  END LOOP;

  IF dropped_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one legacy denomination unique constraint; found %', dropped_count;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_product_catalog_country_operator_amount_currency
  ON product_catalog(country, operator, amount, currency);

COMMIT;
