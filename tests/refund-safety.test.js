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
const refundFlow = fs.readFileSync(path.join(__dirname, '..', 'refund-flow.js'), 'utf8');

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
  assert.match(route, /paymentIntent\.status\s*!==\s*['\\"]succeeded['\\"]/);
  assert.match(route, /paymentIntent\.currency\s*!==\s*['\\"]eur['\\"]/);
  assert.match(route, /amount_received/);
  assert.match(route, /livemode/);
});

test('refund route does not accept an order without a stored PaymentIntent association', () => {
  assert.match(route, /stripe_payment_intent_id/);
  assert.match(route, /PaymentIntent/);
});

test('refund route records/reuses refund state and uses Stripe idempotency', () => {
  assert.match(route, /refund/i);
  assert.match(refundFlow, /idempotencyKey|idempotency_key/);
  assert.match(route, /pending/);
});

test('completed or already-refunded orders are explicitly rejected before any Stripe refund request', () => {
  const guard = route.indexOf("order.status === 'completed' || order.status === 'refunded'");
  const create = route.indexOf('executeReservedRefund');
  assert.notEqual(guard, -1);
  assert.notEqual(create, -1);
  assert.ok(guard < create, 'completed/refunded guard must run before Stripe refund creation');
  assert.match(route.slice(guard, create), /no refund was started/);
});

test('a failed Stripe PaymentIntent lookup returns without starting a refund', () => {
  const lookup = route.indexOf('stripe.paymentIntents.retrieve');
  const create = route.indexOf('executeReservedRefund');
  assert.notEqual(lookup, -1);
  assert.notEqual(create, -1);
  assert.ok(lookup < create);
  assert.match(route.slice(lookup, create), /No refund was started/);
});

test('an existing pending or ambiguous refund record blocks an automatic retry', () => {
  assert.match(route, /A refund record already exists/);
  assert.match(route, /Reconcile it in Stripe Dashboard before retrying/);
  assert.match(route, /existingRefund/);
});

test('Stripe refund uses a stable per-order idempotency key', () => {
  assert.ok(refundFlow.includes('pgnt-refund-${orderId}'));
});

test('refund guard is source-only: this test file never invokes external services', () => {
  assert.match(server, /requireAdmin/);
  const testSource = fs.readFileSync(__filename, 'utf8');
  assert.ok(testSource.includes('fs.readFileSync'));
  assert.doesNotMatch(testSource, /fetch\s*\(/);
});

const paymentStatusStart = server.indexOf("app.get('/api/admin/orders/:orderId/payment-status'");
const paymentStatusEnd = server.indexOf("app.get('/api/admin/orders/review'", paymentStatusStart);
const paymentStatusRoute = paymentStatusStart >= 0 && paymentStatusEnd > paymentStatusStart
  ? server.slice(paymentStatusStart, paymentStatusEnd)
  : '';

test('read-only payment status does not verify association when Stripe objects are missing', () => {
  assert.notEqual(paymentStatusStart, -1, 'payment-status route must exist');
  assert.match(paymentStatusRoute, /Boolean\(session \|\| paymentIntent\)/);
  assert.match(paymentStatusRoute, /const associationVerified/);
});


const dtoneCallbackStart = server.indexOf("app.post('/api/dtone/callback'");
const dtoneCallbackEnd = server.indexOf("\napp.", dtoneCallbackStart + 1);
const dtoneCallbackRoute = dtoneCallbackStart >= 0
  ? server.slice(dtoneCallbackStart, dtoneCallbackEnd > dtoneCallbackStart ? dtoneCallbackEnd : undefined)
  : '';

test('DT One callbacks blocked by a refund reservation are durably recorded for reconciliation without raw payload', () => {
  const reservationGuard = dtoneCallbackRoute.indexOf('if (refundReservation.rowCount === 1)');
  const auditInsert = dtoneCallbackRoute.indexOf("INSERT INTO webhook_events (provider, event_id, payload)");
  const commit = dtoneCallbackRoute.indexOf("await client.query('COMMIT')", reservationGuard);
  const acknowledgement = dtoneCallbackRoute.indexOf('recordedForReview: true', reservationGuard);
  assert.notEqual(reservationGuard, -1);
  assert.notEqual(auditInsert, -1);
  assert.notEqual(commit, -1);
  assert.notEqual(acknowledgement, -1);
  assert.ok(reservationGuard < auditInsert && auditInsert < commit && commit < acknowledgement,
    'callback review evidence must be persisted before the callback is acknowledged');
  assert.match(dtoneCallbackRoute.slice(reservationGuard, commit), /ON CONFLICT \(provider, event_id\) DO NOTHING/);
  assert.match(dtoneCallbackRoute.slice(reservationGuard, commit), /providerTransactionId/);
  assert.match(dtoneCallbackRoute.slice(reservationGuard, commit), /providerStatus/);
  assert.match(dtoneCallbackRoute.slice(reservationGuard, commit), /`\$\{orderId\}:\$\{providerTransactionId\}:\$\{providerStatus\}`/,
    'review event deduplication must be scoped to the order as well as the provider event');
  assert.doesNotMatch(dtoneCallbackRoute.slice(reservationGuard, commit), /JSON\.stringify\(body\)/,
    'do not persist the raw provider payload, which may contain personal data');
});
