-- Read-only verification for migration 016_payment_currency_settings.
DO $$
DECLARE
  currency_count INTEGER;
  eur_active BOOLEAN;
  eur_rate NUMERIC;
  usd_active BOOLEAN;
  gbp_active BOOLEAN;
  usd_rate NUMERIC;
  gbp_rate NUMERIC;
BEGIN
  SELECT COUNT(*) INTO currency_count
  FROM payment_currency_settings
  WHERE currency IN ('EUR', 'USD', 'GBP');
  IF currency_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly the EUR, USD and GBP registry rows; got %', currency_count;
  END IF;

  SELECT active, rate_per_eur INTO eur_active, eur_rate
  FROM payment_currency_settings WHERE currency = 'EUR';
  IF eur_active IS DISTINCT FROM TRUE OR eur_rate IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'EUR must be active with a base rate of 1';
  END IF;

  SELECT active, rate_per_eur INTO usd_active, usd_rate
  FROM payment_currency_settings WHERE currency = 'USD';
  IF usd_active IS DISTINCT FROM FALSE OR usd_rate IS NOT NULL THEN
    RAISE EXCEPTION 'USD must remain disabled with no assumed FX rate';
  END IF;

  SELECT active, rate_per_eur INTO gbp_active, gbp_rate
  FROM payment_currency_settings WHERE currency = 'GBP';
  IF gbp_active IS DISTINCT FROM FALSE OR gbp_rate IS NOT NULL THEN
    RAISE EXCEPTION 'GBP must remain disabled with no assumed FX rate';
  END IF;
END
$$;
