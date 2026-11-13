-- PGNT ASIAN TOPUP: explicit fixed-vs-ranged order identity.
-- REVIEW ONLY: do not wire into startup or apply until runtime integration is reviewed.
-- Existing orders remain FIXED and retain their existing product_catalog identity.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) NOT NULL DEFAULT 'FIXED';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ranged_product_id BIGINT;

-- A ranged order has no fixed product_catalog row. Permit NULL only after
-- adding the explicit fulfillment discriminator and its consistency check.
ALTER TABLE orders
  ALTER COLUMN product_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_fulfillment_type_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_fulfillment_type_check
      CHECK (fulfillment_type IN ('FIXED', 'RANGED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_fulfillment_identity_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_fulfillment_identity_check
      CHECK (
        (fulfillment_type = 'FIXED'
          AND product_id IS NOT NULL
          AND ranged_product_id IS NULL)
        OR
        (fulfillment_type = 'RANGED'
          AND product_id IS NULL
          AND ranged_product_id IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_ranged_product_fk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_ranged_product_fk
      FOREIGN KEY (ranged_product_id)
      REFERENCES dtone_ranged_products(dtone_product_id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_type_status
  ON orders (fulfillment_type, status, created_at DESC);

COMMIT;
