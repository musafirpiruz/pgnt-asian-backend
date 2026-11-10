-- Add request-level idempotency for ranged DT One quote creation.
-- Raw client keys are never stored; only SHA-256 hashes and request fingerprints.
ALTER TABLE dtone_ranged_transactions
  ADD COLUMN IF NOT EXISTS request_key_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS dtone_ranged_transactions_request_key_uidx
  ON dtone_ranged_transactions(request_key_hash)
  WHERE request_key_hash IS NOT NULL;


-- Distributed per-client quote rate limiting; stores only a one-way IP hash.
CREATE TABLE IF NOT EXISTS ranged_quote_rate_limits (
  bucket_hash CHAR(64) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
