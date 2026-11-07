// Source-only regression checks for Stripe webhook release safety.
// No Stripe, PostgreSQL, DT One, payment, or refund requests are made.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf("  '/api/stripe/webhook',");
const end = server.indexOf('\n// IMPORTANT:\n// Move the express.json() line here', start);
const route = start >= 0 && end > start ? server.slice(start, end) : '';

test('Stripe webhook verifies raw body signature before JSON parser', () => {
 assert.ok(start >= 0 && end > start);
 assert.ok(route.includes("express.raw({ type: 'application/json' })"));
 assert.ok(server.indexOf("app.use(express.json({ limit: '100kb' }))") > start);
});
test('webhook fails closed without Stripe configuration and signature', () => {
 for (const value of ["if (!stripe || !STRIPE_WEBHOOK_SECRET)", 'status(503)', "req.headers['stripe-signature']", 'Invalid Stripe webhook signature', 'status(400)']) assert.ok(route.includes(value), value);
});
test('webhook event IDs are durably claimed and duplicates do not repeat side effects', () => {
 for (const value of ['INSERT INTO webhook_events (provider, event_id, payload)', 'ON CONFLICT (provider, event_id) DO NOTHING', 'eventClaim.rowCount === 0', 'duplicate: true']) assert.ok(route.includes(value), value);
});
test('checkout completion is not treated as paid before payment_status confirms paid', () => {
 const a=route.indexOf("case 'checkout.session.completed'"); const b=route.indexOf("case 'checkout.session.async_payment_succeeded'");
 assert.ok(a>=0 && b>a); const block=route.slice(a,b);
 assert.ok(block.includes("session.payment_status !== 'paid'")); assert.ok(block.includes("status: 'awaiting_payment'"));
 assert.ok(block.indexOf("status: 'awaiting_payment'") < block.indexOf('processPaidStripeSession'));
});
test('asynchronous success requires paid status and failed payment uses dedicated handler', () => {
 const a=route.indexOf("case 'checkout.session.async_payment_succeeded'"); const b=route.indexOf("case 'checkout.session.async_payment_failed'",a); const c=route.indexOf("case 'charge.refunded'",b);
 assert.ok(a>=0 && b>a && c>b); const success=route.slice(a,b); const failed=route.slice(b,c);
 assert.ok(success.includes("session.payment_status === 'paid'")); assert.ok(success.includes('processPaidStripeSession(session)')); assert.ok(failed.includes('markCheckoutPaymentFailed(session)'));
});
test('Stripe refund events use the dedicated refund evidence handler', () => assert.ok(route.includes('syncStripeRefundStatus(charge)')));
test('failed webhook processing releases its event claim for Stripe retry', () => {
 for (const value of ['if (webhookEventClaimed)', "DELETE FROM webhook_events WHERE provider = 'stripe' AND event_id = $1", 'status(500)']) assert.ok(route.includes(value), value);
});
test('this suite is source-only', () => {
 const source=fs.readFileSync(__filename,'utf8'); assert.ok(source.includes('Source-only regression checks'));
 assert.ok(!/^\\s*(?:await\\s+)?fetch\\s*\\(/m.test(source));
});
