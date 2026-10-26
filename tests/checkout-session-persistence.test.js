// Regression checks for safe Stripe Checkout Session persistence.
// Source-level checks only: no Stripe, database, refund, or DT One calls are made.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('checkout session persistence does not depend on the order remaining awaiting_payment', () => {
  const helperStart = server.indexOf('async function persistStripeCheckoutSession(');
  const helperEnd = server.indexOf('\nfunction formatEuro(', helperStart);
  assert.notEqual(helperStart, -1, 'session persistence helper must exist');
  assert.ok(helperEnd > helperStart, 'session persistence helper must be bounded');
  const helper = server.slice(helperStart, helperEnd);
  assert.match(helper, /UPDATE orders/);
  assert.match(helper, /stripe_session_id IS NULL OR stripe_session_id = \$1/);
  assert.doesNotMatch(helper, /status\s*=\s*'awaiting_payment'/);
});

test('session persistence verifies the saved row and safely handles an already-saved identical session', () => {
  const helperStart = server.indexOf('async function persistStripeCheckoutSession(');
  const helperEnd = server.indexOf('\nfunction formatEuro(', helperStart);
  const helper = server.slice(helperStart, helperEnd);
  assert.match(helper, /saved\.rowCount === 1/);
  assert.match(helper, /SELECT stripe_session_id FROM orders/);
  assert.match(helper, /current\.rows\[0\]\.stripe_session_id === sessionId/);
  assert.match(helper, /Could not safely associate the Stripe Checkout Session/);
});

test('customer checkout and explicit sandbox checkout both use the guarded persistence helper', () => {
  assert.equal((server.match(/await persistStripeCheckoutSession\(orderId, session\.id\);/g) || []).length, 2);
  assert.doesNotMatch(server, /WHERE order_id = \$2 AND status = 'awaiting_payment'\s*`\s*,\s*\[session\.id, orderId\]/);
});

test('checkout persistence regression test is read-only and has no external side effects', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.match(source, /fs\.readFileSync/);
  assert.match(source, /Source-level checks only/);
  assert.doesNotMatch(source, /require\(['\"]stripe['\"]\)/);
});
