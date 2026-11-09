-- Migration 022: support complete DT One fixed-product identity and safe mapping.
-- This is schema-only. It imports no CSV rows and activates no products or mappings.

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(240),
  ADD COLUMN IF NOT EXISTS product_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS service VARCHAR(120),
  ADD COLUMN IF NOT EXISTS subservice VARCHAR(120),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS wholesale_fee_eur_cents INTEGER
    CHECK (wholesale_fee_eur_cents IS NULL OR wholesale_fee_eur_cents >= 0);

-- A provider may publish several distinct bundles at the same destination amount.
-- Keep product_id as the unique provider identity; do not force amount uniqueness.
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'product_catalog'::regclass
       AND con.contype = 'u'
       AND (
         SELECT array_agg(att.attname ORDER BY att.attname)
           FROM unnest(con.conkey) AS key(attnum)
           JOIN pg_attribute att
             ON att.attrelid = con.conrelid AND att.attnum = key.attnum
       ) = ARRAY['amount','country','currency','operator']::name[]
  LOOP
    EXECUTE format('ALTER TABLE product_catalog DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_catalog_country_operator_amount
  ON product_catalog(country, operator, amount, currency);

ALTER TABLE country_operator_products
  ADD COLUMN IF NOT EXISTS provider_operator_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS provider_product_id VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS country_operator_products_provider_identity_uidx
  ON country_operator_products(country_code, operator_key, provider_product_id)
  WHERE provider_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_catalog_provider_product
  ON product_catalog(product_id);

