-- Version 035: persist the actual Stripe processing fee from BalanceTransaction.
-- Additive only: no existing orders or pricing values are rewritten.
BEGIN;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_fee_eur_cents INTEGER
    CHECK (stripe_fee_eur_cents IS NULL OR stripe_fee_eur_cents >= 0),
  ADD COLUMN IF NOT EXISTS stripe_fee_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_fee_reconciled_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_stripe_balance_transaction
  ON orders(stripe_balance_transaction_id)
  WHERE stripe_balance_transaction_id IS NOT NULL;
INSERT INTO schema_migrations(version)
VALUES ('035_stripe_actual_fee_reconciliation')
ON CONFLICT(version) DO NOTHING;
COMMIT;
