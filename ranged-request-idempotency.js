'use strict';

const crypto = require('crypto');

function normalizeRangedIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
    throw new Error('A valid Idempotency-Key header is required.');
  }
  return key;
}

function hashRangedIdempotencyKey(value) {
  const key = normalizeRangedIdempotencyKey(value);
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

function fingerprintRangedQuote(input) {
  if (!input || typeof input !== 'object') throw new Error('Ranged quote request is invalid.');
  const canonical = {
    country: String(input.country ?? '').trim().toUpperCase(),
    productId: String(input.productId ?? '').trim(),
    operatorKey: String(input.operatorKey ?? '').trim(),
    amount: Number(input.amount),
    phone: String(input.phone ?? '').trim(),
  };
  if (!canonical.country || !canonical.productId || !canonical.operatorKey ||
      !Number.isSafeInteger(canonical.amount) || !canonical.phone) {
    throw new Error('Ranged quote request fingerprint is incomplete.');
  }
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');
}

function createRangedOrderAccessToken(orderId, secret) {
  const key = String(secret ?? '');
  if (key.length < 32) {
    throw new Error('ORDER_ACCESS_TOKEN_SECRET must contain at least 32 characters.');
  }
  const id = String(orderId ?? '').trim();
  if (!id) throw new Error('A ranged order ID is required.');
  return crypto.createHmac('sha256', key)
    .update('pgnt-ranged-order-access-v1:')
    .update(id)
    .digest('hex');
}

module.exports = {
  normalizeRangedIdempotencyKey,
  hashRangedIdempotencyKey,
  fingerprintRangedQuote,
  createRangedOrderAccessToken,
};
