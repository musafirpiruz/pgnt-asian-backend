'use strict';

// Source-level safeguards for the deliberately disabled legacy DT One
// sandbox transaction route. These checks never make network requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dtone-sandbox-test.js'), 'utf8');

test('legacy fixed-price sandbox transaction creation is explicitly disabled with HTTP 410', () => {
  assert.ok(source.includes("app.post('/api/admin/dtone/sandbox-test', requireAdmin"));
  assert.ok(source.includes("return res.status(410).json({"));
  assert.ok(source.includes('created: false'));
  assert.ok(source.includes('legacyRouteDisabled: true'));
  assert.ok(source.includes('Legacy fixed-price sandbox tests are disabled'));
});

test('disabled POST route performs no database, DT One, or order-creation work', () => {
  const postRoute = source.split("app.post('/api/admin/dtone/sandbox-test'")[1]?.split("app.get('/api/admin/dtone/sandbox-test/:orderId'")[0] || '';
  assert.ok(postRoute.includes('return res.status(410).json({'));
  assert.ok(!postRoute.includes('pool.query'));
  assert.ok(!postRoute.includes('fetch('));
  assert.ok(!postRoute.includes('INSERT INTO orders'));
  assert.ok(!postRoute.includes('/v1/transactions'));
});

test('existing sandbox order status lookup remains restricted to the isolated test operator', () => {
  assert.ok(source.includes("app.get('/api/admin/dtone/sandbox-test/:orderId'"));
  assert.ok(source.includes("operator = 'ATOMA-SANDBOX-TEST'"));
  assert.ok(source.includes('Sandbox test order not found.'));
});

test('sandbox route does not create a Stripe payment or perform a refund', () => {
  assert.ok(!source.includes('stripe.paymentIntents.create('));
  assert.ok(!source.includes('stripe.checkout.sessions.create('));
  assert.ok(!source.includes('stripe.refunds.create('));
});
