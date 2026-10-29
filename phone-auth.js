'use strict';

const crypto = require('crypto');

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeE164(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '');
  return E164_PATTERN.test(phone) ? phone : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function registerPhoneAuthRoutes({ app, pool }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';
  const hashSecret = process.env.PHONE_AUTH_HASH_SECRET || '';
  const sessionDays = Math.min(90, Math.max(1, Number(process.env.PHONE_AUTH_SESSION_DAYS) || 30));
  const configured = Boolean(accountSid && authToken && verifyServiceSid && hashSecret);

  function unavailable(res) {
    return res.status(503).json({
      error: 'International phone verification is not configured.',
      code: 'PHONE_AUTH_UNAVAILABLE',
    });
  }

  function hashIdentifier(value) {
    return crypto.createHmac('sha256', hashSecret).update(String(value)).digest('hex');
  }

  async function recordAndCheckLimit({ phone, ipHash, eventType, maxCount, windowMinutes }) {
    const phoneHash = hashIdentifier(phone);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize attempts for this phone/IP pair to prevent concurrent requests
      // from bypassing the per-window count check.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [eventType, phoneHash + ':' + ipHash]
      );
      const result = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM phone_auth_events
          WHERE event_type = $1
            AND created_at > NOW() - ($2::int * INTERVAL '1 minute')
            AND (phone_hash = $3 OR ip_hash = $4)`,
        [eventType, windowMinutes, phoneHash, ipHash]
      );
      if (result.rows[0].count >= maxCount) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        'INSERT INTO phone_auth_events (event_type, phone_hash, ip_hash) VALUES ($1,$2,$3)',
        [eventType, phoneHash, ipHash]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  async function twilioRequest(path, params) {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(verifyServiceSid)}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Phone verification provider request failed.');
      error.providerStatus = response.status;
      throw error;
    }
    return payload;
  }

  app.post('/api/auth/phone/send', async (req, res) => {
    if (!pool || !configured) return unavailable(res);
    const phone = normalizeE164(req.body?.phone);
    if (!phone) {
      return res.status(400).json({
        error: 'Enter a valid international phone number with country calling code, for example +14155552671.',
        code: 'INVALID_E164_PHONE',
      });
    }
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const ipHash = hashIdentifier(ip);
    try {
      const allowed = await recordAndCheckLimit({
        phone, ipHash, eventType: 'send', maxCount: 3, windowMinutes: 60,
      });
      if (!allowed) {
        return res.status(429).json({
          error: 'Too many verification requests. Please try again later.',
          code: 'PHONE_AUTH_RATE_LIMITED',
        });
      }
      await twilioRequest('Verifications', { To: phone, Channel: 'sms' });
      return res.status(202).json({
        sent: true,
        message: 'If this number can receive SMS, a verification code has been requested.',
      });
    } catch (error) {
      console.error('Phone verification send failed.', { providerStatus: error.providerStatus || null });
      return res.status(502).json({
        error: 'Could not request a verification code. Please try again later.',
        code: 'PHONE_AUTH_PROVIDER_ERROR',
      });
    }
  });

  app.post('/api/auth/phone/verify', async (req, res) => {
    if (!pool || !configured) return unavailable(res);
    const phone = normalizeE164(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!phone || !/^\d{4,10}$/.test(code)) {
      return res.status(400).json({
        error: 'Enter a valid international phone number and the SMS verification code.',
        code: 'INVALID_PHONE_OR_CODE',
      });
    }
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const ipHash = hashIdentifier(ip);
    try {
      const allowed = await recordAndCheckLimit({
        phone, ipHash, eventType: 'verify', maxCount: 8, windowMinutes: 30,
      });
      if (!allowed) {
        return res.status(429).json({
          error: 'Too many verification attempts. Please request a new code later.',
          code: 'PHONE_AUTH_RATE_LIMITED',
        });
      }
      const verification = await twilioRequest('VerificationCheck', { To: phone, Code: code });
      if (verification.status !== 'approved') {
        return res.status(401).json({
          error: 'The verification code is invalid or expired.',
          code: 'PHONE_AUTH_CODE_NOT_APPROVED',
        });
      }

      const client = await pool.connect();
      let sessionToken;
      let customer;
      try {
        await client.query('BEGIN');
        const account = await client.query(
          `INSERT INTO customer_accounts (phone_e164, phone_verified_at)
           VALUES ($1, NOW())
           ON CONFLICT (phone_e164)
           DO UPDATE SET phone_verified_at = COALESCE(customer_accounts.phone_verified_at, NOW()),
                         updated_at = NOW()
           RETURNING id, phone_e164, phone_verified_at, created_at`,
          [phone]
        );
        customer = account.rows[0];
        sessionToken = crypto.randomBytes(32).toString('base64url');
        await client.query(
          `INSERT INTO customer_sessions (customer_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 day'))`,
          [customer.id, sha256(sessionToken), sessionDays]
        );
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw error;
      } finally {
        client.release();
      }

      res.set('Cache-Control', 'no-store');
      return res.status(200).json({
        verified: true,
        token: sessionToken,
        tokenType: 'Bearer',
        expiresInDays: sessionDays,
        customer: {
          id: customer.id,
          phone: customer.phone_e164,
          phoneVerified: Boolean(customer.phone_verified_at),
          createdAt: customer.created_at,
        },
      });
    } catch (error) {
      console.error('Phone verification check failed.', { providerStatus: error.providerStatus || null });
      return res.status(502).json({
        error: 'Phone verification could not be completed. Please try again later.',
        code: 'PHONE_AUTH_PROVIDER_ERROR',
      });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/);
    if (!match) return res.status(401).json({ error: 'Sign-in required.', code: 'AUTH_REQUIRED' });
    try {
      const result = await pool.query(
        `SELECT a.id, a.phone_e164, a.phone_verified_at, a.created_at
           FROM customer_sessions s
           JOIN customer_accounts a ON a.id = s.customer_id
          WHERE s.token_hash = $1
            AND s.revoked_at IS NULL
            AND s.expires_at > NOW()
          LIMIT 1`,
        [sha256(match[1])]
      );
      if (!result.rowCount) {
        return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'AUTH_SESSION_EXPIRED' });
      }
      const customer = result.rows[0];
      res.set('Cache-Control', 'no-store');
      return res.json({
        customer: {
          id: customer.id,
          phone: customer.phone_e164,
          phoneVerified: Boolean(customer.phone_verified_at),
          createdAt: customer.created_at,
        },
      });
    } catch (error) {
      console.error('Customer session lookup failed.', error.message);
      return res.status(500).json({ error: 'Could not load customer account.' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,60})$/);
    if (!match) return res.status(204).end();
    try {
      await pool.query(
        'UPDATE customer_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
        [sha256(match[1])]
      );
      return res.status(204).end();
    } catch (error) {
      console.error('Customer logout failed.', error.message);
      return res.status(500).json({ error: 'Could not sign out safely.' });
    }
  });
}

module.exports = { registerPhoneAuthRoutes, normalizeE164 };
