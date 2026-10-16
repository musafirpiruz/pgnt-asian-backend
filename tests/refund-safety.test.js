// Safety regression checks for the admin refund route.
// These tests inspect the route source without calling Stripe, DT One, or the database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routeStart = server.indexOf("app.post('/api/admin/orders/:orderId/refund'");
const route = routeStart >= 0 ? server.slice(routeStart) : '';

test('admin refund route exists and is admin-protected', () => {
  assert.notEqual(routeStart, -1, 'refund route must exist');
  assert.match(route.slice(0, 300), /requireAdmin/);
});

test('refund route requires a reviewed order and final DT One failure', () => {
  assert.match(route, /topup_review/);
  assert.match(route, /declined/);
  assert.match(route, /cancelled|canceled/);
  assert.match(route, /failed/);
});

test('refund route verifies the canonical Stripe PaymentIntent before refunding', () => {
  assert.match(route, /paymentIntents\.retrieve/);
  assert.match(route, /paymentIntent\.status\s*!==\s*['\"]succeeded['\"]/);
  assert.match(route, /paymentIntent\.currency\s*!==\s*['\"]eur['\"]/);
  assert.match(route, /amount_received/);
  assert.match(route, /livemode/);
});

test('refund route does not accept an order without a stored PaymentIntent association', () => {
  assert.match(route, /stripe_payment_intent_id/);
  assert.match(route, /PaymentIntent/);
});

test('refund route records/reuses refund state and uses Stripe idempotency', () => {
  assert.match(route, /refund/i);
  assert.match(route, /idempotencyKey|idempotency_key/);
  assert.match(route, /pending/);
});

test('refund guard is source-only: this test file never invokes external services', () => {
  assert.match(server, /requireAdmin/);
  assert.doesNotMatch(fs.readFileSync(__filename, 'utf8'), /stripe\.refunds\.create|dtoneFetch\(/);
});

const paymentStatusStart = server.indexOf("app.get('/api/admin/orders/:orderId/payment-status'");
const paymentStatusEnd = server.indexOf("app.get('/api/admin/orders/review'", paymentStatusStart);
const paymentStatusRoute = paymentStatusStart >= 0 && paymentStatusEnd > paymentStatusStart
  ? server.slice(paymentStatusStart, paymentStatusEnd)
  : '';

test('read-only payment status does not verify association when Stripe objects are missing', () => {
  assert.notEqual(paymentStatusStart, -1, 'payment-status route must exist');
  assert.match(paymentStatusRoute, /Boolean\\(session \\|\\| paymentIntent\\)/);
  assert.match(paymentStatusRoute, /const associationVerified/);
});
