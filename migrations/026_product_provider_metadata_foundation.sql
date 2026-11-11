-- PGNT ASIAN TOPUP: additive DT One product metadata foundation.
-- REVIEW ONLY: intentionally not wired into migrate.js and not applied to any database.
-- This migration does NOT remove the legacy denomination unique constraint.
-- Apply only after the exact-product selection and seed-upsert migration is reviewed.

BEGIN;

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS provider_product_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_service_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_subservice_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_product_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS provider_details JSONB,
  ADD COLUMN IF NOT EXISTS provider_details_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_details_source VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'product_catalog'::regclass
      AND conname = 'product_catalog_provider_details_object_check'
  ) THEN
    ALTER TABLE product_catalog
      ADD CONSTRAINT product_catalog_provider_details_object_check
      CHECK (provider_details IS NULL OR jsonb_typeof(provider_details) = 'object');
  END IF;
END;
$$;

-- Non-unique browse index only. Provider product_id remains the stable
-- unique external identity; same-denomination products are not enabled by
-- this additive migration while the legacy unique constraint still exists.
CREATE INDEX IF NOT EXISTS idx_product_catalog_country_operator_type
  ON product_catalog(country, operator, provider_product_type);

COMMIT;
