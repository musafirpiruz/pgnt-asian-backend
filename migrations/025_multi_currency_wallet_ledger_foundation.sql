-- PGNT ASIAN TOPUP: additive multi-currency wallet ledger foundation.
-- REVIEW ONLY: intentionally not wired into migrate.js and not applied to any database.
-- Apply only after a verified backup, live wallet preflight, identity review, and approval.

BEGIN;

CREATE TABLE IF NOT EXISTS wallet_accounts_v2 (
  id BIGSERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency IN ('EUR','GBP','USD')),
  available_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  pending_minor BIGINT NOT NULL DEFAULT 0 CHECK (pending_minor >= 0),
  reserved_minor BIGINT NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','frozen','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(firebase_uid, currency)
);

CREATE TABLE IF NOT EXISTS wallet_ledger_accounts (
  id BIGSERIAL PRIMARY KEY,
  wallet_account_id BIGINT REFERENCES wallet_accounts_v2(id) ON DELETE RESTRICT,
  account_code VARCHAR(100) NOT NULL UNIQUE,
  account_type VARCHAR(24) NOT NULL
    CHECK (account_type IN ('customer_wallet','payment_clearing','topup_clearing','fee_revenue','fx_clearing','refund_clearing','adjustment')),
  currency CHAR(3) NOT NULL CHECK (currency IN ('EUR','GBP','USD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (account_type = 'customer_wallet' AND wallet_account_id IS NOT NULL)
    OR (account_type <> 'customer_wallet' AND wallet_account_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_account_wallet
  ON wallet_ledger_accounts(wallet_account_id)
  WHERE wallet_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_ledger_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_key VARCHAR(160) NOT NULL UNIQUE,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  transaction_type VARCHAR(32) NOT NULL
    CHECK (transaction_type IN ('deposit','topup_reserve','topup_capture','topup_release','refund','fx_conversion','referral_reward','admin_adjustment','reversal')),
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','reversed')),
  external_reference VARCHAR(255),
  reversal_of BIGINT REFERENCES wallet_ledger_transactions(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  CHECK ((status = 'draft' AND posted_at IS NULL) OR (status IN ('posted','reversed') AND posted_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_external_reference
  ON wallet_ledger_transactions(transaction_type, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES wallet_ledger_transactions(id) ON DELETE RESTRICT,
  line_number SMALLINT NOT NULL CHECK (line_number > 0),
  ledger_account_id BIGINT NOT NULL REFERENCES wallet_ledger_accounts(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL CHECK (currency IN ('EUR','GBP','USD')),
  debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id, line_number),
  CHECK (
    (debit_minor > 0 AND credit_minor = 0)
    OR (credit_minor > 0 AND debit_minor = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_transaction
  ON wallet_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_account_created
  ON wallet_ledger_entries(ledger_account_id, created_at, id);

-- Posted transactions must balance independently in every currency.
CREATE OR REPLACE FUNCTION pgnt_assert_wallet_ledger_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE target_id BIGINT;
DECLARE target_status VARCHAR(16);
DECLARE unbalanced_count INTEGER;
BEGIN
  target_id := COALESCE(NEW.transaction_id, OLD.transaction_id, NEW.id, OLD.id);
  SELECT status INTO target_status
    FROM wallet_ledger_transactions WHERE id = target_id;
  IF NOT FOUND OR target_status = 'draft' THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO unbalanced_count
  FROM (
    SELECT currency
    FROM wallet_ledger_entries
    WHERE transaction_id = target_id
    GROUP BY currency
    HAVING COUNT(*) < 2 OR SUM(debit_minor) <> SUM(credit_minor)
  ) unbalanced;

  IF unbalanced_count > 0 OR NOT EXISTS (
    SELECT 1 FROM wallet_ledger_entries WHERE transaction_id = target_id
  ) THEN
    RAISE EXCEPTION 'Wallet ledger transaction % is not balanced by currency', target_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ledger_balance_on_transaction
  ON wallet_ledger_transactions;
CREATE CONSTRAINT TRIGGER trg_wallet_ledger_balance_on_transaction
AFTER INSERT OR UPDATE OF status ON wallet_ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION pgnt_assert_wallet_ledger_balanced();

DROP TRIGGER IF EXISTS trg_wallet_ledger_balance_on_entry
  ON wallet_ledger_entries;
CREATE CONSTRAINT TRIGGER trg_wallet_ledger_balance_on_entry
AFTER INSERT ON wallet_ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION pgnt_assert_wallet_ledger_balanced();

-- Entries are immutable. Corrections must be new reversing transactions.
CREATE OR REPLACE FUNCTION pgnt_prevent_wallet_ledger_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Wallet ledger entries are immutable; post a reversal instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ledger_entries_immutable
  ON wallet_ledger_entries;
CREATE TRIGGER trg_wallet_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON wallet_ledger_entries
FOR EACH ROW EXECUTE FUNCTION pgnt_prevent_wallet_ledger_entry_mutation();

COMMIT;
