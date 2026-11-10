'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRangedIdempotencyKey,
  hashRangedIdempotencyKey,
  fingerprintRangedQuote,
  createRangedOrderAccessToken,
} = require('../ranged-request-idempotency');

test('normalizes and hashes a client idempotency key without storing the raw key', () => {
  const key = 'a'.repeat(64);
  assert.equal(normalizeRangedIdempotencyKey(key), key);
  assert.match(hashRangedIdempotencyKey(key), /^[a-f0-9]{64}$/);
  assert.notEqual(hashRangedIdempotencyKey(key), key);
  assert.throws(() => normalizeRangedIdempotencyKey('short'), /Idempotency-Key/);
});

test('fingerprints every quote-defining field and is stable for normalized country casing', () => {
  const base = {
    country: 'af', productId: 98765, operatorKey: 'af-net',
    amount: 150, phone: '+93700100100',
  };
  assert.equal(fingerprintRangedQuote(base), fingerprintRangedQuote({...base, country: 'AF'}));
  assert.notEqual(fingerprintRangedQuote(base), fingerprintRangedQuote({...base, amount: 151}));
  assert.notEqual(fingerprintRangedQuote(base), fingerprintRangedQuote({...base, phone: '+93700100101'}));
});

test('creates a stable unguessable order access token from a server-only secret', () => {
  const secret = 'test-secret-value-that-is-at-least-32-characters';
  const first = createRangedOrderAccessToken('order-1', secret);
  assert.equal(first, createRangedOrderAccessToken('order-1', secret));
  assert.notEqual(first, createRangedOrderAccessToken('order-2', secret));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.throws(() => createRangedOrderAccessToken('order-1', 'short'), /at least 32/);
});
