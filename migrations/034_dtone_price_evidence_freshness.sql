-- Version 034: provenance and freshness metadata for DT One catalog prices.
-- Existing prices are deliberately left unverified; no backfill from legacy values.
BEGIN;
ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS provider_price_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_price_source VARCHAR(32),
  ADD COLUMN IF NOT EXISTS provider_price_product_id BIGINT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'product_catalog'::regclass
      AND conname = 'product_catalog_provider_price_source_check'
  ) THEN
    ALTER TABLE product_catalog
      ADD CONSTRAINT product_catalog_provider_price_source_check
      CHECK (provider_price_source IS NULL OR provider_price_source = 'dtone_api');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_product_catalog_provider_price_evidence
  ON product_catalog(country, provider_price_verified_at DESC)
  WHERE provider_price_source = 'dtone_api';
INSERT INTO schema_migrations(version)
VALUES ('034_dtone_price_evidence_freshness')
ON CONFLICT(version) DO NOTHING;
COMMIT;
