'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server defines the customer-selectable amount policy as 10 through 3000', () => {
  assert.match(server, /const PGNT_MIN_AMOUNT = 10;/);
  assert.match(server, /const PGNT_MAX_AMOUNT = 3000;/);
});

test('checkout rejects amounts below 10, above 3000, and non-integer values', () => {
  const start = server.indexOf('function validateCheckoutInput(body)');
  const end = server.indexOf('// =====================================================\\n// PART 3/8', start);
  assert.ok(start >= 0 && end > start);
  const validator = server.slice(start, end);
  assert.match(validator, /Number\.isSafeInteger\(amount\)/);
  assert.match(validator, /amount < PGNT_MIN_AMOUNT/);
  assert.match(validator, /amount > PGNT_MAX_AMOUNT/);
});

test('price quote rejects amounts outside the same server policy', () => {
  const start = server.indexOf("app.get('/api/pricing/quote'");
  const end = server.indexOf('// =====================================================\\n// PART 4/8', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /amount < PGNT_MIN_AMOUNT/);
  assert.match(route, /amount > PGNT_MAX_AMOUNT/);
});
