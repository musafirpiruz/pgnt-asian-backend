// Source-only regression checks for Stripe webhook release safety.
// These tests do not call Stripe, PostgreSQL, DT One, or external services.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routeStart = server.indexOf("  '/api/stripe/webhook',");
const routeEnd = server.indexOf('\\n// IMPORTANT:\\n// Move the express.json() line here', routeStart);
const route = routeStart >= 0 && routeEnd > routeStart
  ? server.slice(routeStart, routeEnd)
  : '';

test('Stripe webhook route uses raw JSON body and is registered before express.json', () => {
  assert.notEqual(routeStart, -1, 'webhook route must exist');
  assert.ok(routeEnd > routeStart, 'webhook route must be bounded');
  assert.match(route, /express\\.raw\\(\\{ type: 'application\\/json' \\}\\)/);
  const jsonParser = server.indexOf("app.use(express.json({ limit: '100kb' }))");
  assert.ok(jsonParser > routeStart, 'raw webhook route must precede JSON parser');
});

test('webhook fails closed when Stripe or webhook secret is missing', () => {
  assert.match(route, /if \\(!stripe \\|\\| !STRIPE_WEBHOOK_SECRET\\)/);
  assert.match(route, /status\\(503\\)/);
});

test('webhook requires Stripe signature and verifies exact raw request body', () => {
  assert.match(route, /req\\.headers\\['stripe-signature'\\]/);
  assert.match(route, /if \\(!signature\\)/);
  assert.match(route, /status\\(400\\)/);
  assert.match(route, /stripe\\.webhooks\\.constructEvent\\(\\s*req\\.body,\\s*signature,\\s*STRIPE_WEBHOOK_SECRET/s);
  assert.match(route, /Invalid Stripe webhook signature/);
});

test('webhook event ID is durably claimed and duplicate events do not repeat side effects', () => {
  assert.match(route, /INSERT INTO webhook_events \\(provider, event_id, payload\\)/);
  assert.match(route, /ON CONFLICT \\(provider, event_id\\) DO NOTHING/);
  assert.match(route, /if \\(eventClaim\\.rowCount === 0\\)/);
  assert.match(route, /duplicate: true/);
});

test('checkout completed event is not treated as paid until payment_status is paid', () => {
  const completedStart = route.indexOf("case 'checkout.session.completed'");
  const asyncStart = route.indexOf("case 'checkout.session.async_payment_succeeded'");
  assert.ok(completedStart >= 0 && asyncStart > completedStart);
  const completed = route.slice(completedStart, asyncStart);
  assert.match(completed, /session\\.payment_status !== 'paid'/);
  assert.match(completed, /status: 'awaiting_payment'/);
  assert.ok(completed.indexOf("status: 'awaiting_payment'") < completed.indexOf('processPaidStripeSession'));
});

test('asynchronous payment success is fulfilled only after Stripe reports paid', () => {
  const start = route.indexOf("case 'checkout.session.async_payment_succeeded'");
  const end = route.indexOf("case 'checkout.session.async_payment_failed'", start);
  const block = route.slice(start, end);
  assert.match(block, /if \\(session\\.payment_status === 'paid'\\)/);
  assert.match(block, /processPaidStripeSession\\(session\\)/);
});

test('failed async payment and Stripe refund events use dedicated reconciliation handlers', () => {
  assert.match(route, /case 'checkout\\.session\\.async_payment_failed':[\\s\\S]*?markCheckoutPaymentFailed\\(session\\)/);
  assert.match(route, /case 'charge\\.refunded':[\\s\\S]*?syncStripeRefundStatus\\(charge\\)/);
});

test('failed webhook processing releases the event claim so Stripe can retry', () => {
  assert.match(route, /if \\(webhookEventClaimed\\)/);
  assert.match(route, /DELETE FROM webhook_events WHERE provider = 'stripe' AND event_id = \\$1/);
  assert.match(route, /status\\(500\\)/);
});

test('this regression suite is source-only and has no provider or payment side effects', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.match(source, /Source-only regression checks/);
  assert.doesNotMatch(source, /(?:^|\\n)\\s*(?:await\\s+)?fetch\\s*\\(/);
  assert.doesNotMatch(source, /(?:^|\\n)\\s*(?:await\\s+)?stripe\\.checkout\\.sessions\\.create\\s*\\(/);
  assert.doesNotMatch(source, /(?:^|\\n)\\s*(?:await\\s+)?stripe\\.refunds\\.create\\s*\\(/);
});
