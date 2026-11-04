'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf("app.post('/api/admin/orders/:orderId/refund'");
const end = server.indexOf('// Order-status lookup protected by a per-order access token.', start);
const route = start >= 0 && end > start ? server.slice(start, end) : '';

test('real Stripe refunds are fail-closed unless REFUNDS_ENABLED=true is explicitly configured', () => {
  assert.notEqual(start, -1);
  assert.match(route.slice(0, 500), /requireAdmin/);
  const flag = route.indexOf("process.env.REFUNDS_ENABLED");
  const paymentService = route.indexOf('if (!pool || !stripe)');
  const databaseConnect = route.indexOf('client = await pool.connect()');
  const stripeRefund = route.indexOf('executeReservedRefund');
  assert.ok(flag >= 0, 'refund route must have a deployment-level kill switch');
  assert.ok(paymentService > flag, 'feature flag must be checked before payment-service access');
  assert.ok(databaseConnect > flag, 'feature flag must be checked before database reservation');
  assert.ok(stripeRefund > flag, 'feature flag must be checked before any Stripe refund call');
  assert.match(route.slice(flag, paymentService), /Refund processing is disabled by configuration/);
  assert.match(route.slice(flag, paymentService), /No refund was started/);
});

test('refund feature-flag tests do not contact Stripe, DT One, or a database', () => {
  assert.doesNotMatch(fs.readFileSync(__filename, 'utf8'), /fetch\s*\(|stripe\.refunds\.create\s*\(/);
});
