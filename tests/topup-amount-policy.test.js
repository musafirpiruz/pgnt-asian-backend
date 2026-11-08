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
  assert.match(server, /function validateCheckoutInput\\(body\\)[\\s\\S]*?Number\\.isSafeInteger\\(amount\\)[\\s\\S]*?amount < PGNT_MIN_AMOUNT[\\s\\S]*?amount > PGNT_MAX_AMOUNT/);
});

test('price quote rejects amounts outside the same server policy', () => {
  assert.match(server, /app\\.get\\('\\/api\\/pricing\\/quote'[\\s\\S]*?amount < PGNT_MIN_AMOUNT[\\s\\S]*?amount > PGNT_MAX_AMOUNT/);
});
