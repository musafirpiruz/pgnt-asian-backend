'use strict';

const crypto = require('node:crypto');

function safeEqual(candidate, expected) {
  const left = Buffer.from(String(candidate || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function parseAdminApiKeys(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    throw new Error('ADMIN_API_KEYS_JSON must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ADMIN_API_KEYS_JSON must be an object mapping admin IDs to API keys.');
  }
  const entries = Object.entries(parsed);
  if (!entries.length) throw new Error('ADMIN_API_KEYS_JSON must contain at least one admin.');
  const admins = [];
  for (const [actorId, key] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._@-]{0,119}$/.test(actorId) ||
        typeof key !== 'string' || key.trim().length < 32) {
      throw new Error('Each admin requires a valid stable ID and an API key of at least 32 characters.');
    }
    admins.push({ actorId, key });
  }
  return admins;
}

function createAdminAuthenticator({ adminApiKeysJson = '', legacyApiKey = '', legacyActorId = '' } = {}) {
  let admins = [];
  let configurationError = null;
  if (String(adminApiKeysJson).trim()) {
    try {
      admins = parseAdminApiKeys(String(adminApiKeysJson));
    } catch (error) {
      configurationError = error.message;
    }
  } else if (String(legacyApiKey).trim() && String(legacyActorId).trim()) {
    const actorId = String(legacyActorId).trim();
    if (/^[A-Za-z0-9][A-Za-z0-9._@-]{0,119}$/.test(actorId)) {
      admins = [{ actorId, key: String(legacyApiKey) }];
    } else {
      configurationError = 'ADMIN_ACTOR_ID must be a stable admin identifier.';
    }
  } else if (String(legacyApiKey).trim()) {
    configurationError = 'ADMIN_ACTOR_ID is required when using the legacy ADMIN_API_KEY.';
  }

  return Object.freeze({
    configured: admins.length > 0 && !configurationError,
    configurationError,
    authenticate(candidate) {
      if (!admins.length || configurationError || typeof candidate !== 'string' || !candidate) {
        return { configured: admins.length > 0 && !configurationError, authenticated: false, actorId: null };
      }
      let matchedActorId = null;
      // Compare every configured credential before returning a result.
      for (const admin of admins) {
        if (safeEqual(candidate, admin.key)) matchedActorId = admin.actorId;
      }
      return {
        configured: true,
        authenticated: matchedActorId !== null,
        actorId: matchedActorId,
      };
    },
  });
}

module.exports = { createAdminAuthenticator, parseAdminApiKeys };
