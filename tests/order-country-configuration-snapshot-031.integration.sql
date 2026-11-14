\\set ON_ERROR_STOP on

DO $$
DECLARE
  calling_code_nullable TEXT;
  currency_nullable TEXT;
  version_nullable TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '031_order_country_configuration_snapshot'
  ) THEN
    RAISE EXCEPTION 'Migration 031_order_country_configuration_snapshot was not applied';
  END IF;

  SELECT is_nullable INTO STRICT calling_code_nullable
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'orders'
    AND column_name = 'recipient_calling_code_snapshot';
  SELECT is_nullable INTO STRICT currency_nullable
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'orders'
    AND column_name = 'recipient_currency_snapshot';
  SELECT is_nullable INTO STRICT version_nullable
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'orders'
    AND column_name = 'country_configuration_version_snapshot';

  IF calling_code_nullable <> 'YES' OR currency_nullable <> 'YES' OR version_nullable <> 'YES' THEN
    RAISE EXCEPTION 'Country snapshots must remain nullable for pre-migration orders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='orders'::regclass AND conname='orders_recipient_calling_code_snapshot_check' AND contype='c') THEN
    RAISE EXCEPTION 'Calling-code snapshot validation constraint is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='orders'::regclass AND conname='orders_recipient_currency_snapshot_check' AND contype='c') THEN
    RAISE EXCEPTION 'Currency snapshot validation constraint is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='orders'::regclass AND conname='orders_country_configuration_version_snapshot_check' AND contype='c') THEN
    RAISE EXCEPTION 'Configuration-version snapshot validation constraint is missing';
  END IF;
END $$;
