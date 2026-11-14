\set ON_ERROR_STOP on

DO $$
DECLARE
  fulfillment_default TEXT;
  product_nullable TEXT;
  fulfillment_check BOOLEAN;
  identity_check BOOLEAN;
  ranged_fk BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '019_ranged_order_identity'
  ) THEN
    RAISE EXCEPTION 'Migration 019_ranged_order_identity was not applied';
  END IF;

  SELECT column_default, is_nullable
    INTO fulfillment_default, product_nullable
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'orders'
    AND column_name = 'fulfillment_type';

  IF fulfillment_default IS NULL OR fulfillment_default NOT LIKE '%FIXED%' THEN
    RAISE EXCEPTION 'Existing orders must default to FIXED fulfillment';
  END IF;

  IF product_nullable <> 'YES' THEN
    RAISE EXCEPTION 'orders.product_id must allow NULL for ranged fulfillment';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_fulfillment_type_check'
      AND contype = 'c'
  ) INTO fulfillment_check;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_fulfillment_identity_check'
      AND contype = 'c'
  ) INTO identity_check;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class target ON target.oid = c.confrelid
    WHERE c.conrelid = 'orders'::regclass
      AND c.conname = 'orders_ranged_product_fk'
      AND c.contype = 'f'
      AND target.relname = 'dtone_ranged_products'
      AND c.confdeltype = 'r'
  ) INTO ranged_fk;

  IF NOT fulfillment_check THEN
    RAISE EXCEPTION 'Fulfillment type constraint is missing';
  END IF;
  IF NOT identity_check THEN
    RAISE EXCEPTION 'Fixed/ranged identity consistency constraint is missing';
  END IF;
  IF NOT ranged_fk THEN
    RAISE EXCEPTION 'Ranged product FK with ON DELETE RESTRICT is missing';
  END IF;
END $$;
