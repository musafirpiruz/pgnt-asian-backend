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
  const awardStart = callback.indexOf('const ensureReferralRewardRecorded = async');
  const awardEnd = callback.indexOf('// DT One may retry a callback', awardStart);
  const award = awardStart >= 0 && awardEnd > awardStart ? callback.slice(awardStart, awardEnd) : '';
  assert.match(award, /status = 'reserved'/);
  assert.match(award, /status = 'pending'/);
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
  assert.ok(checkout.includes("SET status = 'reversed'"));
  assert.ok(checkout.includes("WHERE order_id = $1 AND status = 'reserved'"));
});

test('capped referral rewards are serialized and count reserved rewards', () => {
  assert.ok(checkout.includes('FROM referral_codes WHERE code = $1 FOR UPDATE'));
  assert.ok(checkout.includes('COUNT(*)::int AS count FROM referral_ledger'));
  assert.ok(checkout.includes("status IN ('reserved','pending','approved','paid')"));
  assert.ok(checkout.includes('This referral code has reached its reward limit'));
});

test('repeated successful DT One callbacks cannot promote or insert a second reward', () => {
  assert.ok(callback.includes("WHERE order_id = $1 AND install_id_hash = $2"));
  assert.ok(callback.includes("status = 'reserved'"));
  assert.ok(callback.includes("RETURNING id"));
  assert.ok(callback.includes("if (!rewardRecorded)"));
  assert.ok(callback.includes("ON CONFLICT DO NOTHING"));
  assert.ok(callback.includes("first_paid_at = COALESCE(first_paid_at, NOW())"));
});


test('duplicate completed DT One callbacks reconcile a missing referral reward without downgrading the order', () => {
  const duplicateStart = callback.indexOf("if (order.status === 'completed')");
  const duplicateEnd = callback.indexOf('// Never allow a callback to change an order', duplicateStart);
  const duplicate = duplicateStart >= 0 && duplicateEnd > duplicateStart
    ? callback.slice(duplicateStart, duplicateEnd)
    : '';
  assert.match(duplicate, /providerStatus === 'completed'/);
  assert.match(duplicate, /ensureReferralRewardRecorded\(order\)/);
  assert.match(duplicate, /status: 'completed'/);
  assert.match(duplicate, /duplicate: true/);
  assert.match(callback, /const ensureReferralRewardRecorded = async/);
  assert.ok(callback.includes("AND status IN ('pending','approved','paid')"));
  assert.ok(callback.includes('LIMIT 1'));
  assert.match(callback, /Referral reward reconciliation required for completed top-up/);
});

test('Stripe session persistence failure does not release a reservation that may still be payable', () => {
  const sessionCreated = checkout.indexOf('stripeSessionCreated = true');
  const persistSession = checkout.indexOf('await persistStripeCheckoutSession(orderId, session.id);', sessionCreated);
  const catchStart = checkout.indexOf('} catch (error) {', persistSession);
  const cleanup = checkout.indexOf('if (orderId && !transactionOpen && !stripeSessionCreated)', catchStart);
  assert.ok(sessionCreated >= 0 && persistSession > sessionCreated && catchStart > persistSession);
  assert.ok(cleanup > catchStart);
  assert.ok(checkout.indexOf('Keep the reservation when Stripe returned a session') > catchStart);
});

test('admin referral code creation and updates enforce the fixed €0.07 reward', () => {
  const createStart = server.indexOf("app.post('/api/admin/referrals/codes'");
  const listStart = server.indexOf("app.get('/api/admin/referrals'", createStart);
  const updateStart = server.indexOf("app.patch('/api/admin/referrals/codes/:code'");
  const pageStart = server.indexOf("app.get('/admin-dtone-check'", updateStart);
  const createRoute = createStart >= 0 && listStart > createStart ? server.slice(createStart, listStart) : '';
  const updateRoute = updateStart >= 0 && pageStart > updateStart ? server.slice(updateStart, pageStart) : '';
  assert.notEqual(createStart, -1);
  assert.notEqual(updateStart, -1);
  assert.match(createRoute, /rewardEurCents !== 7/);
  assert.match(createRoute, /fixed at €0\.07/);
  assert.match(updateRoute, /reward !== 7/);
  assert.match(updateRoute, /fixed at €0\.07/);
  assert.match(createRoute, /VALUES \(\$1,\$2,\$3,\$4,\$5,FALSE\)/);
});


test('admin page exposes referral code creation, activation, and reporting controls', () => {
  const pageStart = server.indexOf("app.get('/admin-dtone-check'");
  const pageEnd = server.indexOf('`);\n});', pageStart);
  const page = pageStart >= 0 && pageEnd > pageStart ? server.slice(pageStart, pageEnd) : '';
  assert.ok(pageStart >= 0);
  assert.match(page, /id="createReferralCode"/);
  assert.match(page, /id="loadReferralReport"/);
  assert.match(page, /id="referralReport"/);
  assert.match(page, /\/api\/admin\/referrals\/codes/);
  assert.match(page, /\/api\/admin\/referrals/);
  assert.match(page, /rewardEurCents:7/);
  assert.match(page, /starts disabled/);
});

test('unused referral codes can only be deleted when disabled and without attribution or ledger history', () => {
  assert.match(server, /app\.delete\('\/api\/admin\/referrals\/codes\/:code', requireAdmin/);
  const start = server.indexOf("app.delete('/api/admin/referrals/codes/:code'");
  const end = server.indexOf("app.get('/admin-dtone-check'", start);
  const route = start >= 0 && end > start ? server.slice(start, end) : '';
  assert.match(route, /active === true/);
  assert.match(route, /referral_attributions/);
  assert.match(route, /referral_ledger/);
  assert.match(route, /cannot be deleted/);
  assert.match(route, /BEGIN/);
  assert.match(route, /COMMIT/);
  assert.match(server, /Delete unused code/);
  assert.match(server, /method:'DELETE'/);
});
