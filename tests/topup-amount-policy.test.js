'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server defines the customer-selectable amount policy as 10 through 3000', () => {
  assert.ok(server.includes('const PGNT_MIN_AMOUNT = 10;'));
  assert.ok(server.includes('const PGNT_MAX_AMOUNT = 3000;'));
});

test('checkout rejects amounts below 10, above 3000, and non-integer values', () => {
  const start = server.indexOf('function validateCheckoutInput(body)');
  const end = server.indexOf('return {', start);
  assert.ok(start >= 0 && end > start);
  const validator = server.slice(start, end);
  assert.ok(validator.includes('Number.isSafeInteger(amount)'));
  assert.ok(validator.includes('amount < PGNT_MIN_AMOUNT'));
  assert.ok(validator.includes('amount > PGNT_MAX_AMOUNT'));
});

test('price quote applies the same amount policy to legacy operator/amount selection', () => {
  const start = server.indexOf("app.get('/api/pricing/quote'");
  const end = server.indexOf("app.post('/api/payments/checkout'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.ok(route.includes('validLegacySelection'));
  assert.match(route, /Number\.isSafeInteger\(amount\) && amount >= PGNT_MIN_AMOUNT && amount <= PGNT_MAX_AMOUNT/);
  assert.match(route, /validProductId \? productId : null/);
});
