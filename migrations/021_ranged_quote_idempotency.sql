-- Add request-level idempotency for ranged DT One quote creation.
-- Raw client keys are never stored; only SHA-256 hashes and request fingerprints.
ALTER TABLE dtone_ranged_transactions
  ADD COLUMN IF NOT EXISTS request_key_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS dtone_ranged_transactions_request_key_uidx
  ON dtone_ranged_transactions(request_key_hash)
  WHERE request_key_hash IS NOT NULL;
