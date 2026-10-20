-- Verify migration 009 upgrades the old schema without losing existing ledger data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM referral_ledger
    WHERE order_id = 'ci-existing-pre009-order'
      AND referral_code = 'CIUPGRADE009'
      AND install_id_hash = repeat('c', 64)
      AND reward_eur_cents = 7
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'existing referral ledger row was not preserved by migration 009';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'referral_ledger'
      AND indexname = 'uq_referral_ledger_active_install'
  ) THEN
    RAISE EXCEPTION 'migration 009 active-install index is missing after upgrade';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'referral_ledger'::regclass
      AND conname = 'referral_ledger_install_id_hash_key'
  ) THEN
    RAISE EXCEPTION 'old full unique constraint was not removed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '009_referral_reward_reservations'
  ) THEN
    RAISE EXCEPTION 'migration 009 was not recorded';
  END IF;
END $$;
