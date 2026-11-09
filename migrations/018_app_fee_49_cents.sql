-- PGNT ASIAN TOPUP
-- Migration 018: set the configured application fee to EUR 0.49
-- Preserve Stripe fee settings, FX values, bonus settings, and product activation.
BEGIN;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM pricing_settings
    WHERE country IN ('AF', 'PK', 'IN', 'BD')
  ) <> 4 THEN
    RAISE EXCEPTION 'Migration 018 stopped: expected pricing settings for AF, PK, IN, and BD';
  END IF;
END
$$;

UPDATE pricing_settings
SET fee_eur_cents = 49,
    updated_at = NOW()
WHERE country IN ('AF', 'PK', 'IN', 'BD');

INSERT INTO schema_migrations (version)
VALUES ('018_app_fee_49_cents')
ON CONFLICT (version) DO NOTHING;

COMMIT;
