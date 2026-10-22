// Regression checks for the failed top-up -> review -> refund flow.
// These are source-level checks only: no real Stripe refund or DT One request is made.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

const callbackStart = server.indexOf("app.post('/api/dtone/callback'");
const callbackEnd = server.indexOf('// Mark a failed asynchronous Stripe payment', callbackStart);
const callback = callbackStart >= 0 && callbackEnd > callbackStart
  ? server.slice(callbackStart, callbackEnd)
  : '';

const refundStart = server.indexOf("app.post('/api/admin/orders/:orderId/refund'");
const refundRoute = refundStart >= 0 ? server.slice(refundStart) : '';

test('DT One final failure enters review, not automatic fulfillment or automatic refund', () => {
  assert.notEqual(callbackStart, -1, 'DT One callback route must exist');
  assert.match(callback, /providerStatus === 'failed'/);
  assert.match(callback, /nextStatus = 'topup_review'/);
  assert.match(callback, /A provider failure is not itself a Stripe refund/);
  assert.doesNotMatch(callback, /stripe\.refunds\.create/);
});

test('unknown or pending provider status cannot qualify for a refund', () => {
  assert.match(refundRoute, /order\.status !== 'topup_review'/);
  assert.match(refundRoute, /Refund requires a final DT One failure status/);
  assert.match(refundRoute, /\['failed', 'rejected', 'cancelled', 'canceled', 'declined'\]/);
});

test('refund is admin-only and verifies the canonical paid EUR PaymentIntent', () => {
  assert.match(refundRoute.slice(0, 180), /requireAdmin/);
  assert.match(refundRoute, /stripe\.paymentIntents\.retrieve/);
  assert.match(refundRoute, /paymentIntent\.status !== 'succeeded'/);
  assert.match(refundRoute, /paymentIntent\.currency !== 'eur'/);
  assert.match(refundRoute, /paymentIntent\.amount_received !== Number\(order\.charge_cents\)/);
  assert.match(refundRoute, /paymentIntent\.livemode === stripeIsTest/);
});

test('completed top-ups and existing ambiguous refunds cannot be refunded again', () => {
  assert.match(refundRoute, /order\.status === 'completed' \|\| order\.status === 'refunded'/);
  assert.match(refundRoute, /A refund record already exists\. Reconcile it in Stripe Dashboard before retrying/);
  assert.match(refundRoute, /idempotencyKey: `pgnt-refund-\$\{orderId\}`/);
});

test('customer app maps review and refund outcomes to visible transaction states', () => {
  const statusStart = app.indexOf('TransactionStatus _statusFromServer');
  const statusEnd = app.indexOf('Future<void> refreshOrderStatus', statusStart);
  const mapper = statusStart >= 0 && statusEnd > statusStart
    ? app.slice(statusStart, statusEnd)
    : '';
  assert.notEqual(statusStart, -1, 'client status mapper must exist');
  assert.match(mapper, /case 'refunded':/);
  assert.match(mapper, /case 'topup_review':/);
  assert.match(mapper, /return TransactionStatus\.underReview/);
  assert.match(mapper, /return TransactionStatus\.failed/);
});

test('these regression checks never call external payment or top-up services', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|stripe\.refunds\.create\s*\(/);
});


test('refund stays under review unless Stripe confirms the refund succeeded', () => {
  const createRefund = refundRoute.indexOf('stripe.refunds.create');
  const updateRefund = refundRoute.indexOf('UPDATE refunds SET stripe_refund_id');
  const successGuard = refundRoute.indexOf("if (refund.status === 'succeeded')");
  const markRefunded = refundRoute.indexOf("SET status = 'refunded'");
  assert.ok(createRefund >= 0 && updateRefund > createRefund);
  assert.ok(successGuard > updateRefund);
  assert.ok(markRefunded > successGuard);
  const nonSuccessBranch = refundRoute.slice(successGuard, refundRoute.indexOf("await client.query('COMMIT')", successGuard));
  assert.match(nonSuccessBranch, /status = 'topup_review'/);
  assert.match(nonSuccessBranch, /refund\.status/);
});

test('refund operation holds the order lock and creates a pending audit row before contacting Stripe', () => {
  const lock = refundRoute.indexOf('FOR UPDATE');
  const pendingInsert = refundRoute.indexOf("VALUES ($1, $2, 'pending', $3)");
  const stripeCall = refundRoute.indexOf('stripe.refunds.create');
  assert.ok(lock >= 0 && pendingInsert > lock && stripeCall > pendingInsert);
  assert.match(refundRoute, /idempotencyKey: `pgnt-refund-\$\{orderId\}`/);
  assert.match(refundRoute, /A refund record already exists\. Reconcile it in Stripe Dashboard before retrying/);
});
