// Read-only regression checks for Stripe payments whose local order row is missing.
// These tests inspect source only; they do not call Stripe, PostgreSQL, DT One, or refunds.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routeStart = server.indexOf("app.get('/api/admin/orders/:orderId/payment-status'");
const routeEnd = server.indexOf("app.get('/api/admin/orders/review'", routeStart);
const route = routeStart >= 0 && routeEnd > routeStart
  ? server.slice(routeStart, routeEnd)
  : '';

test('missing local order triggers exact Stripe PaymentIntent metadata lookup', () => {
  assert.notEqual(routeStart, -1, 'admin reconciliation route must exist');
  assert.match(route, /if \(result\.rowCount !== 1\)/);
  assert.match(route, /stripe\.paymentIntents\.search\(/);
  assert.match(route, /metadata\['orderId'\]/);
  assert.match(route, /candidate\.metadata\?\.orderId === orderId/);
});

test('missing-order diagnostic is read-only and never silently creates or fulfills an order', () => {
  assert.match(route, /localOrderFound: false/);
  assert.match(route, /associationVerified:/);
  assert.match(route, /No order was created and no top-up or refund was triggered/);
  assert.doesNotMatch(route, /INSERT INTO orders/i);
  assert.doesNotMatch(route, /processPaidStripeSession\(/);
  assert.doesNotMatch(route, /stripe\.refunds\.create\(/);
  assert.doesNotMatch(route, /fetch\(endpoint/);
});

test('no exact Stripe metadata match is reported as unresolved, not as proof of no payment', () => {
  assert.match(route, /Local order not found and no exact Stripe PaymentIntent metadata match was found/);
  assert.match(route, /Stripe search can be eventually consistent/);
});

test('missing local order searches Checkout Sessions by exact client reference or order metadata', () => {
  assert.match(route, /stripe\.checkout\.sessions\.list\(/);
  assert.match(route, /item\.client_reference_id === orderId/);
  assert.match(route, /item\.metadata\?\.orderId === orderId/);
  assert.match(route, /stripeSessionFound: true/);
  assert.match(route, /stripePaymentStatus: matchedSession\.payment_status/);
  assert.match(route, /sessionPagesScanned/);
});

test('Checkout Session fallback remains read-only and does not fulfill a missing order', () => {
  const missingOrderBranch = route.slice(0, route.indexOf("const order = result.rows[0]"));
  assert.match(missingOrderBranch, /restore\/reconcile the missing local order through an audited admin process/);
  assert.doesNotMatch(missingOrderBranch, /INSERT INTO orders/i);
  assert.doesNotMatch(missingOrderBranch, /processPaidStripeSession\(/);
  assert.doesNotMatch(missingOrderBranch, /stripe\.refunds\.create\(/);
});

test('missing-order diagnostic can retrieve a supplied exact Checkout Session ID', () => {
  assert.match(route, /req\.query\.session_id/);
  assert.match(route, /stripe\.checkout\.sessions\.retrieve\(\s*suppliedSessionId/);
  assert.match(route, /Stripe Checkout Session does not exactly match the requested order ID/);
  assert.match(route, /associationVerified: true/);
});

test('supplied Checkout Session lookup does not create an order or trigger side effects', () => {
  const missingOrderBranch = route.slice(0, route.indexOf("const order = result.rows[0]"));
  assert.doesNotMatch(missingOrderBranch, /INSERT INTO orders/i);
  assert.doesNotMatch(missingOrderBranch, /processPaidStripeSession\(/);
  assert.doesNotMatch(missingOrderBranch, /stripe\.refunds\.create\(/);
});

test('existing local order can use a supplied session when its saved session ID is absent', () => {
  const existingOrderBranch = route.slice(route.indexOf('const order = result.rows[0]'));
  assert.match(existingOrderBranch, /const suppliedSessionId = String\(req\.query\.session_id \|\| ''\)\.trim\(\)/);
  assert.match(existingOrderBranch, /if \(suppliedSessionId && !order\.stripe_session_id\)/);
  assert.match(existingOrderBranch, /stripe\.checkout\.sessions\.retrieve\(\s*suppliedSessionId/);
  assert.match(existingOrderBranch, /sessionOrderId !== orderId/);
  assert.match(existingOrderBranch, /clientReferenceMatches: exactSession\.client_reference_id === orderId/);
  assert.match(existingOrderBranch, /metadataOrderIdMatches: exactSession\.metadata\?\.orderId === orderId/);
});

test('existing-order supplied-session reconciliation remains read-only and validates the session ID', () => {
  const existingOrderBranch = route.slice(route.indexOf('const order = result.rows[0]'));
  assert.ok(existingOrderBranch.includes("if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(suppliedSessionId))"));
  assert.match(existingOrderBranch, /No local order or payment was changed/);
  assert.doesNotMatch(existingOrderBranch, /UPDATE orders/i);
  assert.doesNotMatch(existingOrderBranch, /INSERT INTO orders/i);
  assert.doesNotMatch(existingOrderBranch, /stripe\.refunds\.create\(/);
  assert.doesNotMatch(existingOrderBranch, /processPaidStripeSession\(/);
});
