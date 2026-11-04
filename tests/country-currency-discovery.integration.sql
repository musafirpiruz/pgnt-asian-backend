\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='country_currency_discoveries'
  ) THEN
    RAISE EXCEPTION 'Migration 022 did not create country_currency_discoveries';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='country_currency_discoveries'
      AND column_name='source_reference'
  ) THEN
    RAISE EXCEPTION 'Currency discovery source reference column is missing';
  END IF;
END $$;

INSERT INTO country_currency_discoveries
  (country_code,currencies,source,source_reference,observed_at,selection_status)
VALUES
  ('AF','[{"currency":"AFN","name":"Afghan afghani","symbol":"؋"}]'::jsonb,
   'integration-test','https://example.invalid/currency-metadata',NOW(),'pending')
ON CONFLICT (country_code) DO UPDATE SET
  currencies=EXCLUDED.currencies,source=EXCLUDED.source,
  source_reference=EXCLUDED.source_reference,observed_at=EXCLUDED.observed_at,
  selected_currency=NULL,selected_at=NULL,selection_status='pending';

DO $$
DECLARE
  candidate_count INTEGER;
  saved_source TEXT;
BEGIN
  SELECT jsonb_array_length(currencies),source
    INTO candidate_count,saved_source
  FROM country_currency_discoveries WHERE country_code='AF';
  IF candidate_count <> 1 OR saved_source <> 'integration-test' THEN
    RAISE EXCEPTION 'Currency discovery metadata was not persisted correctly';
  END IF;
END $$;
