-- CI assertions for migration 014 Afghanistan catalog seed.
-- Runs only against the isolated PostgreSQL service in GitHub Actions.
BEGIN;

DO $$
DECLARE
  seeded_count INTEGER;
  active_count INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO seeded_count
  FROM product_catalog
  WHERE country = 'AF'
    AND currency = 'AFN'
    AND (
      (LOWER(operator) IN ('roshan','etisalat','awcc','salaam','atoma')
       AND amount IN (100,150,250,500,1000))
      OR (LOWER(operator) = 'atoma' AND amount = 115)
    )
    AND product_id IN (
      6149,6157,6161,6171,6191,
      6478,6554,6558,6568,6588,
      10531,10596,10599,10535,10536,
      23130,23135,23142,23152,23172,
      7191,7199,7203,7213,7233,7194
    );

  IF seeded_count <> 26 THEN
    RAISE EXCEPTION 'migration 014 expected 26 catalog rows, found %', seeded_count;
  END IF;

  SELECT COUNT(*)::int INTO active_count
  FROM product_catalog
  WHERE country = 'AF'
    AND currency = 'AFN'
    AND product_id IN (
      6149,6157,6161,6171,6191,
      6478,6554,6558,6568,6588,
      10531,10596,10599,10535,10536,
      23130,23135,23142,23152,23172,
      7191,7199,7203,7213,7233,7194
    )
    AND active IS TRUE;

  IF active_count <> 0 THEN
    RAISE EXCEPTION 'migration 014 must keep all 26 seeded products inactive; found % active', active_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM product_catalog
    WHERE country = 'AF'
      AND currency = 'AFN'
      AND product_id IN (
        6149,6157,6161,6171,6191,
        6478,6554,6558,6568,6588,
        10531,10596,10599,10535,10536,
        23130,23135,23142,23152,23172,
        7191,7199,7203,7213,7233,7194
      )
      AND (wholesale_price_eur_cents IS NULL OR wholesale_price_eur_cents <= 0
           OR price_eur_cents IS NULL OR price_eur_cents <= 0
           OR bonus_amount <> 0)
  ) THEN
    RAISE EXCEPTION 'a seeded product has invalid wholesale/retail price or non-zero legacy bonus';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM product_catalog
    WHERE country = 'AF'
      AND currency = 'AFN'
      AND LOWER(operator) IN ('roshan','etisalat','awcc','salaam','atoma')
      AND amount IN (100,150,250,500,1000,115)
      AND active IS TRUE
  ) THEN
    RAISE EXCEPTION 'migration 014 activated an Afghanistan product unexpectedly';
  END IF;
END $$;

ROLLBACK;
