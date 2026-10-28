'use strict';

// Source-level regression checks for Stripe refund webhook reconciliation.
// No Stripe, DT One, database, payment, or refund calls are made.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('async function syncStripeRefundStatus(charge) {');
const end = server.indexOf('\n// =====================================================\n// PART 8/8 — ADMIN SECURITY & SERVER STARTUP', start);
const handler = start >= 0 && end > start ? server.slice(start, end) : '';

test('refund webhook loads the stored EUR charge amount and locks the matching order', () => {
  assert.notEqual(start, -1, 'refund webhook handler must exist');
  assert.ok(end > start, 'refund webhook handler must have a bounded section');
  assert.match(handler, /SELECT order_id, status, charge_cents/);
  assert.match(handler, /WHERE stripe_payment_intent_id = \$1\s+FOR UPDATE/);
});

test('refund webhook validates EUR currency and the canonical charged amount', () => {
  assert.match(handler, /String\(charge\.currency \|\| ''\)\.toLowerCase\(\) === 'eur'/);
  assert.match(handler, /chargeAmount === orderChargeAmount/);
  assert.match(handler, /Number\.isSafeInteger\(refundedAmount\)/);
  assert.match(handler, /refundedAmount <= chargeAmount/);
});

test('a refund is only marked succeeded when the complete verified amount was refunded', () => {
  assert.match(handler, /charge\.refunded === true/);
  assert.match(handler, /refundedAmount === orderChargeAmount/);
  assert.match(handler, /const refundStatus = !refundEvidenceMatches\s*\? 'needs_review'/);
  assert.match(handler, /WHEN \$1 = TRUE THEN 'refunded'/);
  assert.match(handler, /\[fullRefund, order\.order_id\]/);
});

test('mismatched or incomplete refund evidence is recorded for manual review', () => {
  assert.match(handler, /Stripe refund webhook amount\/currency did not match/);
  assert.match(handler, /ELSE 'topup_review'/);
  assert.match(handler, /status = CASE[\s\S]*?ELSE EXCLUDED\.status[\s\S]*?END/);
  assert.doesNotMatch(handler, /const fullRefund = charge\.refunded === true/);
});

test('late partial or pending webhook cannot downgrade an already confirmed refund', () => {
  assert.match(handler, /!\['completed', 'refunded'\]\.includes\(order\.status\)/);
  assert.match(handler, /WHEN refunds\.status = 'succeeded' THEN refunds\.status/);
  assert.match(handler, /WHEN refunds\.status = 'succeeded'\s+THEN refunds\.amount_cents/);
  assert.match(handler, /WHEN refunds\.status = 'succeeded'\s+THEN refunds\.stripe_refund_id/);
  assert.match(handler, /WHEN refunds\.status = 'succeeded' THEN refunds\.reason/);
});
