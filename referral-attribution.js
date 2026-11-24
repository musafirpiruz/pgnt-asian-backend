'use strict';

const crypto = require('crypto');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function registerReferralAttributionRoute({ app, pool, authMiddleware }) {
  if (!app || typeof app.post !== 'function') {
    throw new TypeError('An Express-compatible app is required.');
  }
  if (typeof authMiddleware !== 'function') {
    throw new TypeError('Firebase authentication middleware is required.');
  }

  app.post('/api/referrals/attribute', authMiddleware, async (req, res) => {
    if (!pool || typeof pool.connect !== 'function') {
      return res.status(503).json({
        error: 'Referral attribution is temporarily unavailable.',
        code: 'REFERRAL_DATABASE_UNAVAILABLE',
      });
    }

    const token = String(req.body?.token || '').trim();
    if (!TOKEN_PATTERN.test(token)) {
      return res.status(400).json({
        error: 'A valid invite token is required.',
        code: 'REFERRAL_TOKEN_INVALID',
      });
    }

    const uid = String(req.auth?.uid || '');
    if (!uid || uid.length > 128) {
      return res.status(401).json({
        error: 'Verified Firebase identity is required.',
        code: 'REFERRAL_IDENTITY_REQUIRED',
      });
    }

    const tokenHash = crypto.createHash('sha256')
      .update(token, 'utf8')
      .digest('hex');
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const referral = await client.query(
        `SELECT code
         FROM referral_codes
         WHERE link_token_hash = $1
           AND active = TRUE
           AND link_token_revoked_at IS NULL
         FOR UPDATE`,
        [tokenHash]
      );

      if (referral.rowCount !== 1) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(404).json({
          error: 'This invite link is invalid, inactive, or revoked.',
          code: 'REFERRAL_LINK_UNAVAILABLE',
        });
      }

      const referralCode = referral.rows[0].code;
      const inserted = await client.query(
        `INSERT INTO referral_attributions
           (install_id_hash, firebase_uid, referral_code, created_at)
         VALUES (NULL, $1, $2, NOW())
         ON CONFLICT (firebase_uid) WHERE firebase_uid IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [uid, referralCode]
      );

      if (inserted.rowCount === 1) {
        await client.query('COMMIT');
        transactionOpen = false;
        return res.status(201).json({
          attributed: true,
          alreadyAttributed: false,
          rewardEligible: false,
          message: 'Invite link saved. Reward eligibility remains disabled until checkout integration is verified.',
        });
      }

      const existing = await client.query(
        `SELECT referral_code
         FROM referral_attributions
         WHERE firebase_uid = $1
         FOR UPDATE`,
        [uid]
      );
      if (existing.rowCount !== 1 || existing.rows[0].referral_code !== referralCode) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          error: 'This account is already attributed to another invite.',
          code: 'REFERRAL_ALREADY_ATTRIBUTED',
        });
      }

      await client.query('COMMIT');
      transactionOpen = false;
      return res.status(200).json({
        attributed: true,
        alreadyAttributed: true,
        rewardEligible: false,
        message: 'This account is already attributed to this invite.',
      });
    } catch (error) {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      console.error('Referral attribution failed.', {
        errorName: error?.name || 'Error',
      });
      return res.status(500).json({
        error: 'Could not save referral attribution.',
        code: 'REFERRAL_ATTRIBUTION_FAILED',
      });
    } finally {
      client.release();
    }
  });
}

module.exports = { registerReferralAttributionRoute, TOKEN_PATTERN };
