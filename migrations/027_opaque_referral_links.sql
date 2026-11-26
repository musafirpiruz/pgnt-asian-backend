-- Opaque public referral links.
-- The public URL carries a cryptographically random token; the existing
-- referral code remains an internal database identifier only. Never store
-- the raw token or expose the internal code to the mobile client.
BEGIN;

ALTER TABLE referral_codes
  ADD COLUMN IF NOT EXISTS link_token_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS link_token_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_token_revoked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_codes_link_token_hash
  ON referral_codes(link_token_hash)
  WHERE link_token_hash IS NOT NULL;

COMMIT;
