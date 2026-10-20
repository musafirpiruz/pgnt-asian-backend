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
  assert.match(checkout, /referralClientErrors/);
  assert.match(checkout, /res\.status\(400\)\.json\(\{ error: error\.message \}\)/);
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

test('deactivating a code after checkout does not block an already reserved reward', () => {
  const awardStart = callback.indexOf('// Promote the checkout-time reservation only after final DT One success.');
  const awardEnd = callback.indexOf("await client.query('COMMIT')", awardStart);
  const award = awardStart >= 0 && awardEnd > awardStart ? callback.slice(awardStart, awardEnd) : '';
  assert.match(award, /status = 'reserved'/);
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

test('checkout reserves referral cap capacity transactionally before commit', () => {
  assert.match(checkout, /status IN \('reserved','pending','approved','paid'\)/);
  assert.match(checkout, /VALUES \(\$1, \$2, \$3, \$4, 'reserved'\)/);
  assert.ok(checkout.indexOf("INSERT INTO referral_ledger") < checkout.indexOf("await client.query('COMMIT')"));
});

test('successful DT One callback promotes a reservation instead of consuming a second slot', () => {
  assert.match(callback, /SET status = 'pending', updated_at = NOW\(\)/);
  assert.match(callback, /status = 'reserved'/);
  assert.match(callback, /first_order_id = COALESCE\(first_order_id, \$1\)/);
});

test('migration allows reserved ledger entries and only one active reward per install', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  assert.match(source, /009_referral_reward_reservations/);
  assert.match(source, /'reserved','pending','approved','paid','reversed'/);
  assert.match(source, /uq_referral_ledger_active_install/);
});

test('failed Stripe checkout payment releases only a reservation for the matching unpaid order', () => {
  const start = server.indexOf('async function markCheckoutPaymentFailed');
  const end = server.indexOf('// Record refund state only', start);
  const fn = server.slice(start, end);
  assert.match(fn, /status = 'payment_failed'/);
  assert.match(fn, /status = 'reversed'/);
  assert.match(fn, /WHERE order_id = \$1 AND status = 'reserved'/);
});

test('Stripe checkout creation failure releases the reserved referral slot', () => {
  assert.match(checkout, /let stripeSessionCreated = false/);
  assert.match(checkout, /stripeSessionCreated = true/);
  assert.match(checkout, /!stripeSessionCreated/);
  assert.match(checkout, /Checkout reservation cleanup failed/);
  assert.match(checkout, /SET status = 'reversed'[\\s\\S]*WHERE order_id = \\$1 AND status = 'reserved'/);
});
