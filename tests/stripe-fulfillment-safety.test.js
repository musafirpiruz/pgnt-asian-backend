// Source-level regression checks for Stripe-to-DT One fulfillment safety.
// These tests inspect server.js only; they do not call Stripe, DT One, or PostgreSQL.
// Run with: node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('async function processPaidStripeSession(session)');
const end = server.indexOf('// =====================================================\n// PART 7/8', start);
const fulfillment = start >= 0 && end > start ? server.slice(start, end) : '';

test('Stripe fulfillment function exists and re-fetches the canonical Checkout Session', () => {
  assert.notEqual(start, -1, 'fulfillment function must exist');
  assert.match(fulfillment, /checkout\.sessions\.retrieve\(eventSessionId/);
  assert.match(fulfillment, /session\.payment_status !== 'paid'/);
});

test('Stripe fulfillment verifies EUR, succeeded PaymentIntent, amount, and live/test mode', () => {
  assert.match(fulfillment, /session\.currency !== 'eur'/);
  assert.match(fulfillment, /paymentIntent\.status !== 'succeeded'/);
  assert.match(fulfillment, /paymentIntent\.currency !== 'eur'/);
  assert.match(fulfillment, /paymentIntent\.amount_received !== session\.amount_total/);
  assert.match(fulfillment, /session\.livemode === stripeIsTest/);
});

test('order association and charged amount are checked before fulfillment', () => {
  assert.match(fulfillment, /order\.stripe_session_id !== session\.id/);
  assert.match(fulfillment, /Number\(order\.charge_cents\) !== session\.amount_total/);
  assert.match(fulfillment, /WHERE order_id = \$1\s+FOR UPDATE/);
});

test('already-processing, submitted, completed, review, and refunded orders are not fulfilled again', () => {
  const guard = fulfillment.indexOf("'processing_topup'");
  const update = fulfillment.indexOf("SET status = 'processing_topup'");
  const providerRequest = fulfillment.indexOf('await fetch(endpoint');
  assert.notEqual(guard, -1);
  assert.notEqual(update, -1);
  assert.notEqual(providerRequest, -1);
  assert.ok(guard < update, 'duplicate-state guard must precede state update');
  assert.ok(update < providerRequest, 'order must be claimed before provider request');
  assert.match(fulfillment, /'topup_submitted'[\s\S]*?'completed'[\s\S]*?'topup_review'[\s\S]*?'refunded'/);
});

test('DT One submission uses the local order ID as external_id and stores provider reference separately', () => {
  assert.match(fulfillment, /external_id:\s*orderId/);
  assert.match(fulfillment, /const providerReference\s*=\s*data\.id/);
  assert.match(fulfillment, /dtone_transaction_id = \$1/);
});

test('ambiguous DT One timeout or HTTP failure is sent to review, not blindly retried', () => {
  assert.match(fulfillment, /AbortSignal\.timeout\(20000\)/);
  assert.match(fulfillment, /DT One outcome is unknown; manual\/status review required/);
  assert.match(fulfillment, /DT One request needs review/);
  assert.doesNotMatch(fulfillment, /automaticRetry\s*:\s*true/);
});

test('these source checks never invoke external side effects', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|stripe\.refunds\.create/);
});
