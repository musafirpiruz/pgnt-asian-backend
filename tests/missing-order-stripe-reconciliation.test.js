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
