-- Firebase UID-based referral identity foundation.
-- Preserve historical install-hash rows while allowing verified-UID records.
-- This migration does not enable authentication, attribution, rewards, or checkout.
BEGIN;

ALTER TABLE referral_attributions
  ALTER COLUMN install_id_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);

ALTER TABLE referral_ledger
  ALTER COLUMN install_id_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS referral_firebase_uid VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_attributions_firebase_uid
  ON referral_attributions(firebase_uid)
  WHERE firebase_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_ledger_firebase_uid
  ON referral_ledger(firebase_uid)
  WHERE firebase_uid IS NOT NULL;

ALTER TABLE referral_attributions
  ADD CONSTRAINT referral_attributions_identity_required
  CHECK (install_id_hash IS NOT NULL OR firebase_uid IS NOT NULL)
  NOT VALID;

ALTER TABLE referral_ledger
  ADD CONSTRAINT referral_ledger_identity_required
  CHECK (install_id_hash IS NOT NULL OR firebase_uid IS NOT NULL)
  NOT VALID;

ALTER TABLE referral_attributions
  VALIDATE CONSTRAINT referral_attributions_identity_required;

ALTER TABLE referral_ledger
  VALIDATE CONSTRAINT referral_ledger_identity_required;

COMMIT;
