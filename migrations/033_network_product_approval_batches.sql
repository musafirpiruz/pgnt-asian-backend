-- Version 033: auditable network-scoped bulk product approval batches.
-- Approval records do not activate products or make them customer-sellable.
BEGIN;
CREATE TABLE IF NOT EXISTS country_network_product_approval_batches (
  id BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE RESTRICT,
  operator_key VARCHAR(100) NOT NULL,
  source_product_catalog_id BIGINT NOT NULL REFERENCES product_catalog(id) ON DELETE RESTRICT,
  approved_product_count INTEGER NOT NULL CHECK (approved_product_count > 0),
  blocked_product_count INTEGER NOT NULL DEFAULT 0 CHECK (blocked_product_count >= 0),
  policy_version INTEGER,
  actor VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (BTRIM(actor) <> '')
);
CREATE TABLE IF NOT EXISTS country_network_product_approval_items (
  batch_id BIGINT NOT NULL REFERENCES country_network_product_approval_batches(id) ON DELETE RESTRICT,
  country_operator_product_id BIGINT NOT NULL REFERENCES country_operator_products(id) ON DELETE RESTRICT,
  product_catalog_id BIGINT NOT NULL REFERENCES product_catalog(id) ON DELETE RESTRICT,
  provider_product_id BIGINT NOT NULL,
  wholesale_price_eur_cents INTEGER NOT NULL CHECK (wholesale_price_eur_cents > 0),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(batch_id, country_operator_product_id),
  UNIQUE(batch_id, product_catalog_id)
);
CREATE INDEX IF NOT EXISTS country_network_approval_batches_lookup
  ON country_network_product_approval_batches(country_code, operator_key, created_at DESC);
INSERT INTO schema_migrations(version)
VALUES ('033_network_product_approval_batches')
ON CONFLICT(version) DO NOTHING;
COMMIT;
