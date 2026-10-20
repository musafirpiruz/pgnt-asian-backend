// Source-level regression checks for referral reward safety.
// These tests never call Stripe, DT One, or the database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const checkoutStart = server.indexOf("app.post('/api/payments/checkout'");
const checkoutEnd = server.indexOf("// Dedicated Stripe + DT One end-to-end test.", checkoutStart);
const checkout = checkoutStart >= 0 && checkoutEnd > checkoutStart
  ? server.slice(checkoutStart, checkoutEnd)
  : '';
const callbackStart = server.indexOf("app.post('/api/dtone/callback'");
const callbackEnd = server.indexOf("// Register the tightly restricted DT One pre-production test routes.", callbackStart);
const callback = callbackStart >= 0 && callbackEnd > callbackStart
  ? server.slice(callbackStart, callbackEnd)
  : '';

test('checkout requires a valid referral code and stable install identifier together', () => {
  assert.notEqual(checkoutStart, -1);
  assert.match(checkout, /referralCode/);
  assert.match(checkout, /referralInstallId/);
  assert.match(checkout, /\^\[A-Z0-9_-\]\{4,40\}\$/);
  assert.match(checkout, /\^\[A-Za-z0-9._:-\]\{16,128\}\$/);
});

test('install identifiers are hashed before persistence and cannot be attributed to a different code', () => {
  assert.match(checkout, /createHash\('sha256'\)/);
  assert.match(checkout, /ON CONFLICT \(install_id_hash\) DO NOTHING/);
  assert.match(checkout, /already attributed to another referral code/);
  assert.match(checkout, /referral_install_id/);
});

test('reward ledger is written only on final DT One completed status and is idempotent', () => {
  assert.notEqual(callbackStart, -1);
  assert.match(callback, /nextStatus === 'completed'/);
  assert.match(callback, /INSERT INTO referral_ledger/);
  assert.match(callback, /ON CONFLICT DO NOTHING/);
  assert.match(callback, /first_paid_at = COALESCE\(first_paid_at, NOW\(\)\)/);
});

test('deactivating a code after checkout does not erase a reward already earned', () => {
  const awardStart = callback.indexOf('// Create the reward only after a final successful DT One callback.');
  const awardEnd = callback.indexOf("await client.query('COMMIT')", awardStart);
  const award = awardStart >= 0 && awardEnd > awardStart ? callback.slice(awardStart, awardEnd) : '';
  assert.match(award, /Once a paid order has a valid attribution/);
  assert.doesNotMatch(award, /rows\[0\]\.active === true/);
});

test('failed or review statuses cannot directly award referral credit', () => {
  assert.match(callback, /nextStatus === 'completed'/);
  assert.doesNotMatch(callback, /nextStatus === 'failed'[\s\S]{0,300}INSERT INTO referral_ledger/);
});

test('referral tests are source-only and never call provider APIs', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.ok(source.includes('fs.readFileSync'));
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /refunds\.create/);
});
