// Source-level regression checks for payment fulfillment idempotency.
// These checks do not call Stripe, DT One, or the database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('async function processPaidStripeSession');
const end = server.indexOf("app.post('/api/stripe/webhook'", start);
const fulfillment = start >= 0 && end > start ? server.slice(start, end) : '';

test('Stripe fulfillment re-fetches canonical Checkout Session before fulfillment', () => {
  assert.notEqual(start, -1);
  assert.match(fulfillment, /checkout\.sessions\.retrieve/);
  assert.match(fulfillment, /payment_status !== 'paid'/);
  assert.match(fulfillment, /paymentIntent\.status !== 'succeeded'/);
  assert.match(fulfillment, /paymentIntent\.amount_received !== session\.amount_total/);
});

test('Stripe fulfillment validates saved session, amount and recipient currency', () => {
  assert.match(fulfillment, /order\.stripe_session_id !== session\.id/);
  assert.match(fulfillment, /Number\(order\.charge_cents\) !== session\.amount_total/);
  assert.match(fulfillment, /countryCurrency\(order\.country\)/);
});

test('Stripe duplicate delivery is blocked by an order row lock and terminal/in-progress status guard', () => {
  assert.match(fulfillment, /FOR UPDATE/);
  assert.match(fulfillment, /'processing_topup'[\s\S]*?'topup_submitted'[\s\S]*?'completed'[\s\S]*?'topup_review'[\s\S]*?'refunded'/);
  assert.match(fulfillment, /duplicate: true/);
});

test('ambiguous DT One outcomes go to review instead of automatic resubmission', () => {
  assert.match(fulfillment, /DT One outcome is unknown; manual\/status review required/);
  assert.match(fulfillment, /DT One request needs review/);
  assert.match(fulfillment, /status = 'topup_review'/);
});

test('DT One request uses the stable order ID as external_id', () => {
  assert.match(fulfillment, /external_id: orderId/);
  assert.match(fulfillment, /product_id: Number\(product\.rows\[0\]\.dtone_product_id\)/);
});

test('these tests remain source-only and do not invoke provider APIs', () => {
  const testSource = fs.readFileSync(__filename, 'utf8');
  assert.ok(testSource.includes('fs.readFileSync'));
  assert.doesNotMatch(testSource, /fetch\s*\(/);
  assert.doesNotMatch(testSource, /refunds\.create/);
});
