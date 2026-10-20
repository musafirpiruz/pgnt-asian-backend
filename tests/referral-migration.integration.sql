-- Database-backed safety checks for migration 009.
-- Runs only against the isolated PostgreSQL service in GitHub Actions.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'referral_ledger'::regclass
      AND conname = 'referral_ledger_status_check'
  ) THEN
    RAISE EXCEPTION 'referral_ledger_status_check is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'referral_ledger'
      AND indexname = 'uq_referral_ledger_active_install'
  ) THEN
    RAISE EXCEPTION 'active-install unique index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'referral_ledger'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%reserved%'
  ) THEN
    RAISE EXCEPTION 'reserved ledger status is not allowed';
  END IF;
END $$;

INSERT INTO referral_codes (code, owner_name, reward_eur_cents, active, max_rewards)
VALUES ('CITEST009', 'CI integration test', 7, TRUE, 2);

INSERT INTO referral_ledger
  (referral_code, install_id_hash, order_id, reward_eur_cents, status)
VALUES
  ('CITEST009', repeat('a', 64), 'ci-order-reserved', 7, 'reserved');

DO $$
BEGIN
  BEGIN
    INSERT INTO referral_ledger
      (referral_code, install_id_hash, order_id, reward_eur_cents, status)
    VALUES
      ('CITEST009', repeat('a', 64), 'ci-order-duplicate-active', 7, 'pending');
    RAISE EXCEPTION 'duplicate active reward unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- Reversed entries must not block a later valid reservation for the same install.
UPDATE referral_ledger
SET status = 'reversed'
WHERE order_id = 'ci-order-reserved';

INSERT INTO referral_ledger
  (referral_code, install_id_hash, order_id, reward_eur_cents, status)
VALUES
  ('CITEST009', repeat('a', 64), 'ci-order-retry', 7, 'reserved');

ROLLBACK;
