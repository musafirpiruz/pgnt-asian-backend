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
  assert.match(mapper, /value\?\.toString\(\)\.toLowerCase\(\) == 'refunded'/);
  assert.match(mapper, /case 'topup_review':/);
  assert.match(mapper, /return TransactionStatus\.underReview/);
  assert.match(mapper, /return TransactionStatus\.failed/);
});

test('these regression checks never call external payment or top-up services', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|stripe\.refunds\.create\s*\(/);
});


test('customer order-status API exposes refund state without exposing the refund reason', () => {
  const statusStart = server.indexOf("app.get('/api/orders/:orderId/status'");
  const statusRoute = statusStart >= 0 ? server.slice(statusStart) : '';
  assert.notEqual(statusStart, -1);
  assert.match(statusRoute, /AS refund_status/);
  assert.match(statusRoute, /refundStatus: order\.refund_status \|\| null/);
  assert.doesNotMatch(statusRoute, /reason: order\.refund/);
});

test('ambiguous Stripe refund outcome is marked for reconciliation, not assumed pending or successful', () => {
  assert.match(refundRoute, /UPDATE refunds SET status = 'needs_review'/);
  assert.match(refundRoute, /Stripe refund outcome is not confirmed/);
});

test('customer app distinguishes pending, completed and review-required refunds', () => {
  assert.match(app, /TransactionStatus\.refundPending/);
  assert.match(app, /TransactionStatus\.refunded/);
  assert.match(app, /TransactionStatus\.refundNeedsReview/);
  assert.match(app, /refundStatus: decoded\['refundStatus'\]/);
});


test('refund status labels are localized for all six supported app languages', () => {
  const labelStart = app.indexOf('String statusLabel(');
  const labelEnd = app.indexOf('// Transaction data model', labelStart);
  const labels = labelStart >= 0 && labelEnd > labelStart
    ? app.slice(labelStart, labelEnd)
    : '';
  assert.match(labels, /tr\(languageCode, 'refundPending'\)/);
  assert.match(labels, /tr\(languageCode, 'refunded'\)/);
  assert.match(labels, /tr\(languageCode, 'refundNeedsReview'\)/);

  const translationStart = app.indexOf('const Map<String, Map<String, String>> translations = {');
  assert.notEqual(translationStart, -1);
  const translationMap = app.slice(translationStart);
  for (const language of ['ps', 'fa', 'en', 'ur', 'hi', 'bn']) {
    const languageStart = translationMap.indexOf(`'${language}': {`);
    assert.notEqual(languageStart, -1, `missing translations for ${language}`);
    const nextLanguage = translationMap.indexOf("\n  '", languageStart + 1);
    const block = translationMap.slice(languageStart, nextLanguage >= 0 ? nextLanguage : undefined);
    assert.match(block, /'refundPending':/);
    assert.match(block, /'refunded':/);
    assert.match(block, /'refundNeedsReview':/);
  }
});


test('refund reservation is committed before the external Stripe refund request', () => {
  const reservationInsert = refundRoute.indexOf("INSERT INTO refunds (order_id, amount_cents, status, reason)");
  const reservationCommit = refundRoute.indexOf("await client.query('COMMIT')", reservationInsert);
  const stripeCall = refundRoute.indexOf("stripe.refunds.create", reservationInsert);
  assert.ok(reservationInsert >= 0, 'durable reservation insert must exist');
  assert.ok(reservationCommit > reservationInsert, 'reservation must commit before Stripe is called');
  assert.ok(stripeCall > reservationCommit, 'Stripe call must follow the durable reservation commit');
  assert.match(refundRoute, /A database failure leaves the committed pending reservation in place/);
});

test('DT One callbacks cannot change an order after a refund reservation exists', () => {
  assert.match(callback, /SELECT status FROM refunds WHERE order_id = \$1 LIMIT 1/);
  assert.match(callback, /if \(refundReservation\.rowCount === 1\)/);
  assert.match(callback, /status: 'refund_review'/);
  assert.match(callback, /ignored: true/);
});
