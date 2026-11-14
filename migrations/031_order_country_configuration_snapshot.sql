-- Preserve the validated recipient-country configuration on each fixed order.
-- This lets already-paid orders fulfill with the exact settings used at checkout,
-- even if an administrator later disables or edits the live country registry.
BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS recipient_calling_code_snapshot VARCHAR(5),
  ADD COLUMN IF NOT EXISTS recipient_currency_snapshot VARCHAR(3),
  ADD COLUMN IF NOT EXISTS country_configuration_version_snapshot BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_recipient_calling_code_snapshot_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_recipient_calling_code_snapshot_check
      CHECK (
        recipient_calling_code_snapshot IS NULL
        OR recipient_calling_code_snapshot ~ '^\\+[1-9][0-9]{0,3}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_recipient_currency_snapshot_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_recipient_currency_snapshot_check
      CHECK (
        recipient_currency_snapshot IS NULL
        OR recipient_currency_snapshot ~ '^[A-Z]{3}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_country_configuration_version_snapshot_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_country_configuration_version_snapshot_check
      CHECK (
        country_configuration_version_snapshot IS NULL
        OR country_configuration_version_snapshot > 0
      );
  END IF;
END $$;

INSERT INTO schema_migrations(version)
VALUES ('031_order_country_configuration_snapshot')
ON CONFLICT (version) DO NOTHING;

COMMIT;
