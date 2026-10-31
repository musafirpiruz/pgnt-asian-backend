'use strict';

// Firebase Admin SDK adapter boundary for the final authentication phase.
// The caller must pass Firebase Admin's verifyIdToken function. This module
// never sends SMS and never initializes Firebase with implicit credentials.
const E164_PATTERN = /^\\+[1-9]\\d{7,14}$/;

function createFirebaseAuthMiddleware({
  verifyIdToken,
  projectId,
  requirePhoneNumber = false,
} = {}) {
  const configured = typeof verifyIdToken === 'function' &&
    typeof projectId === 'string' && projectId.trim().length > 0;
  const expectedProjectId = configured ? projectId.trim() : null;
  const expectedIssuer = configured
    ? `https://securetoken.google.com/${expectedProjectId}`
    : null;

  return async function firebaseAuthMiddleware(req, res, next) {
    if (!configured) {
      return res.status(503).json({
        error: 'Firebase authentication is not configured.',
        code: 'FIREBASE_AUTH_NOT_CONFIGURED',
      });
    }

    const authorization = String(req.get
      ? req.get('authorization') || ''
      : req.headers?.authorization || '').trim();
    const match = /^Bearer ([^\\s]+)$/i.exec(authorization);
    if (!match) {
      return res.status(401).json({
        error: 'A valid Firebase bearer token is required.',
        code: 'FIREBASE_TOKEN_REQUIRED',
      });
    }

    try {
      // checkRevoked=true makes Firebase Admin check token revocation as well
      // as signature, expiry, issuer and audience.
      const claims = await verifyIdToken(match[1], true);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const validClaims = claims &&
        typeof claims === 'object' &&
        typeof claims.uid === 'string' &&
        claims.uid.length > 0 &&
        claims.sub === claims.uid &&
        claims.aud === expectedProjectId &&
        claims.iss === expectedIssuer &&
        Number.isInteger(claims.exp) &&
        claims.exp > nowSeconds;

      if (!validClaims) {
        return res.status(401).json({
          error: 'Firebase token claims are invalid.',
          code: 'FIREBASE_TOKEN_INVALID',
        });
      }

      const phoneNumber = typeof claims.phone_number === 'string' &&
        E164_PATTERN.test(claims.phone_number)
        ? claims.phone_number
        : null;
      if (requirePhoneNumber && !phoneNumber) {
        return res.status(401).json({
          error: 'A verified E.164 phone number is required.',
          code: 'FIREBASE_PHONE_CLAIM_REQUIRED',
        });
      }

      // Identity comes only from verified Firebase claims. Do not merge
      // request-body fields such as uid, phone, install ID or referral owner.
      req.auth = Object.freeze({
        uid: claims.uid,
        phoneNumber,
        authTime: Number.isInteger(claims.auth_time) ? claims.auth_time : null,
      });
      return next();
    } catch (_) {
      // Do not log or return token contents, Firebase errors or credentials.
      return res.status(401).json({
        error: 'Firebase token is invalid, expired or revoked.',
        code: 'FIREBASE_TOKEN_REJECTED',
      });
    }
  };
}

module.exports = { createFirebaseAuthMiddleware };
