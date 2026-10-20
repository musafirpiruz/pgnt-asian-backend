-- Reconstruct the pre-009 referral ledger schema in the isolated CI database.
-- This deliberately leaves an existing reward row in place to test upgrade safety.
BEGIN;

DELETE FROM referral_ledger WHERE order_id = 'ci-existing-pre009-order';
DELETE FROM referral_codes WHERE code = 'CIUPGRADE009';

INSERT INTO referral_codes (code, owner_name, reward_eur_cents, active, max_rewards)
VALUES ('CIUPGRADE009', 'Migration upgrade test', 7, TRUE, 10);

INSERT INTO referral_ledger
  (referral_code, install_id_hash, order_id, reward_eur_cents, status)
VALUES
  ('CIUPGRADE009', repeat('c', 64), 'ci-existing-pre009-order', 7, 'pending');

DROP INDEX IF EXISTS uq_referral_ledger_active_install;
ALTER TABLE referral_ledger
  DROP CONSTRAINT IF EXISTS referral_ledger_status_check;
ALTER TABLE referral_ledger
  ADD CONSTRAINT referral_ledger_status_check
  CHECK (status IN ('pending','approved','paid','reversed'));
ALTER TABLE referral_ledger
  DROP CONSTRAINT IF EXISTS referral_ledger_install_id_hash_key;
ALTER TABLE referral_ledger
  ADD CONSTRAINT referral_ledger_install_id_hash_key UNIQUE (install_id_hash);

DELETE FROM schema_migrations
WHERE version = '009_referral_reward_reservations';

COMMIT;
