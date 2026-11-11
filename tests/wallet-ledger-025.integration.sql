-- Isolated PostgreSQL integration test for the unshipped wallet-ledger proposal.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/wallet-ledger-025.integration.sql

CREATE SCHEMA wallet_ledger_025_test;
SET search_path TO wallet_ledger_025_test, public;
\ir ../migrations/025_multi_currency_wallet_ledger_foundation.sql

DO $$
DECLARE
  wallet_id BIGINT;
  wallet_ledger_id BIGINT;
  clearing_id BIGINT;
  tx_id BIGINT;
  rejected BOOLEAN := FALSE;
BEGIN
  INSERT INTO wallet_accounts_v2(firebase_uid, currency)
  VALUES ('wallet-ledger-test-user', 'EUR')
  RETURNING id INTO wallet_id;

  INSERT INTO wallet_ledger_accounts(wallet_account_id, account_code, account_type, currency)
  VALUES (wallet_id, 'customer-eur-test', 'customer_wallet', 'EUR')
  RETURNING id INTO wallet_ledger_id;

  INSERT INTO wallet_ledger_accounts(account_code, account_type, currency)
  VALUES ('clearing-eur-test', 'payment_clearing', 'EUR')
  RETURNING id INTO clearing_id;

  -- A posted journal with equal debit and credit must commit.
  INSERT INTO wallet_ledger_transactions(transaction_key, idempotency_key, transaction_type, status, posted_at)
  VALUES ('deposit-test-1', 'deposit-idem-1', 'deposit', 'draft', NULL)
  RETURNING id INTO tx_id;
  INSERT INTO wallet_ledger_entries(transaction_id, line_number, ledger_account_id, currency, debit_minor)
  VALUES (tx_id, 1, clearing_id, 'EUR', 500);
  INSERT INTO wallet_ledger_entries(transaction_id, line_number, ledger_account_id, currency, credit_minor)
  VALUES (tx_id, 2, wallet_ledger_id, 'EUR', 500);
  UPDATE wallet_ledger_transactions SET status = 'posted', posted_at = NOW() WHERE id = tx_id;

  -- Unbalanced journals must fail at transaction commit.
  BEGIN
    INSERT INTO wallet_ledger_transactions(transaction_key, idempotency_key, transaction_type, status, posted_at)
    VALUES ('deposit-test-unbalanced', 'deposit-idem-unbalanced', 'deposit', 'draft', NULL)
    RETURNING id INTO tx_id;
    INSERT INTO wallet_ledger_entries(transaction_id, line_number, ledger_account_id, currency, debit_minor)
    VALUES (tx_id, 1, clearing_id, 'EUR', 700);
    UPDATE wallet_ledger_transactions SET status = 'posted', posted_at = NOW() WHERE id = tx_id;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected unbalanced journal to be rejected';
  EXCEPTION WHEN check_violation OR raise_exception THEN
    IF SQLERRM = 'Expected unbalanced journal to be rejected' THEN RAISE; END IF;
    rejected := TRUE;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Unbalanced journal was accepted'; END IF;
  SET CONSTRAINTS ALL DEFERRED;

  -- Entries cannot be appended after posting.
  rejected := FALSE;
  BEGIN
    INSERT INTO wallet_ledger_entries(transaction_id, line_number, ledger_account_id, currency, debit_minor)
    VALUES ((SELECT id FROM wallet_ledger_transactions WHERE transaction_key = 'deposit-test-1'), 3, clearing_id, 'EUR', 1);
  EXCEPTION WHEN raise_exception THEN rejected := TRUE;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Posted journal accepted a new entry'; END IF;

  -- Posted headers cannot be changed or deleted.
  rejected := FALSE;
  BEGIN
    UPDATE wallet_ledger_transactions SET external_reference = 'mutated' WHERE transaction_key = 'deposit-test-1';
  EXCEPTION WHEN raise_exception THEN rejected := TRUE;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Posted journal header was mutable'; END IF;

  -- Journal lines cannot be changed or deleted.
  rejected := FALSE;
  BEGIN
    DELETE FROM wallet_ledger_entries
    WHERE transaction_id = (SELECT id FROM wallet_ledger_transactions WHERE transaction_key = 'deposit-test-1');
  EXCEPTION WHEN raise_exception THEN rejected := TRUE;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Ledger lines were mutable'; END IF;

  -- Duplicate idempotency keys must be rejected.
  rejected := FALSE;
  BEGIN
    INSERT INTO wallet_ledger_transactions(transaction_key, idempotency_key, transaction_type)
    VALUES ('deposit-test-duplicate', 'deposit-idem-1', 'deposit');
  EXCEPTION WHEN unique_violation THEN rejected := TRUE;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Duplicate idempotency key was accepted'; END IF;
END;
$$;

RESET search_path;
DROP SCHEMA wallet_ledger_025_test CASCADE;
