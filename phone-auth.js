'use strict';

// Phone authentication is intentionally disabled until Firebase Authentication
// is integrated and verified end-to-end. The previous Twilio Verify integration
// has been removed: this application must not send paid SMS through Twilio.
// The final Firebase phase will verify Firebase ID tokens server-side; Firebase
// client SDK will own SMS delivery. No provider credentials are read here.

const E164_PATTERN = /^\\+[1-9]\\d{7,14}$/;

function normalizeE164(value) {
  const phone = String(value || '').trim().replace(/[\\s().-]/g, '');
  return E164_PATTERN.test(phone) ? phone : null;
}

function rateLimitLockKeys(eventType, phoneHash, ipHash) {
  return [`${eventType}:phone:${phoneHash}`, `${eventType}:ip:${ipHash}`].sort();
}

function registerPhoneAuthRoutes({ app }) {
  const deferred = (_req, res) => res.status(503).json({
    error: 'Phone sign-in is not available yet. Firebase Authentication will be enabled in the final release phase.',
    code: 'PHONE_AUTH_DEFERRED',
    provider: 'firebase',
    smsSent: false,
  });

  app.post('/api/auth/phone/send', deferred);
  app.post('/api/auth/phone/verify', deferred);
  app.get('/api/auth/me', deferred);
  app.post('/api/auth/logout', (_req, res) => res.status(503).json({
    error: 'Phone sign-in is not enabled yet.',
    code: 'PHONE_AUTH_DEFERRED',
  }));
}

module.exports = { registerPhoneAuthRoutes, normalizeE164, rateLimitLockKeys };
