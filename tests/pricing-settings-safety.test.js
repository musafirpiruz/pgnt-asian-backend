// Source-level guard tests for server-side pricing configuration.
// No network, Stripe, DT One, or database access is performed.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('async function getPricingSettings(client, country) {');
const end = server.indexOf('\n}\n\n// Read an enabled product from the database.', start);
assert.notEqual(start, -1, 'getPricingSettings must exist');
assert.ok(end > start, 'getPricingSettings function boundary must be found');
const source = server.slice(start, end + 2);

test('pricing settings require one active country configuration', () => {
  assert.match(source, /if \(result\.rowCount !== 1\)/);
  assert.match(source, /settings\.active !== true/);
});

test('pricing settings reject invalid Stripe percentage and fixed fee', () => {
  assert.match(source, /stripeFeePercent < 0 \|\| stripeFeePercent >= 100/);
  assert.match(source, /requireNonNegativeInteger\(\s*settings\.stripe_fixed_fee_cents/);
});

test('pricing settings validate the app fee, FX rate, and bonus bounds', () => {
  assert.match(source, /requireNonNegativeInteger\(\s*settings\.fee_eur_cents/);
  assert.match(source, /!Number\.isFinite\(afnPerEur\) \|\| afnPerEur <= 0/);
  assert.match(source, /bonusPercent < 0 \|\| bonusPercent > 100/);
});

test('pricing settings explicitly keep EUR as the payment currency', () => {
  assert.match(source, /currency: 'EUR'/);
});
