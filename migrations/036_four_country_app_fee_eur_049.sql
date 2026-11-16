-- Version 036: set the owner-approved application fee to EUR 0.49 in all four supported countries.
-- This changes only pricing_settings. Existing orders, order snapshots, catalog prices,
-- FX observations, product activation, payments and top-ups are not modified.
BEGIN;

DO $migration$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE pricing_settings
     SET fee_eur_cents = 49,
         updated_at = NOW()
   WHERE country IN ('AF', 'PK', 'IN', 'BD');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 4 THEN
    RAISE EXCEPTION
      'Migration 036 expected exactly four pricing_settings rows (AF, PK, IN, BD); updated %',
      updated_count;
  END IF;
END
$migration$;

INSERT INTO schema_migrations(version)
VALUES ('036_four_country_app_fee_eur_049')
ON CONFLICT (version) DO NOTHING;

COMMIT;
