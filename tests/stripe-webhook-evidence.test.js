// Read-only regression checks for persisted Stripe webhook evidence.
// These tests inspect source only; they do not call Stripe, PostgreSQL, DT One, or refunds.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Stripe candidate report inspects stored webhook events by exact order references', () => {
  const routeStart = server.indexOf("app.get('/api/admin/orders/:orderId/stripe-candidates', requireAdmin");
  const routeEnd = server.indexOf("\napp.get('/api/admin/orders/review'", routeStart);
  assert.notEqual(routeStart, -1);
  assert.ok(routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /FROM webhook_events/);
  assert.match(route, /payload #>> '\{data,object,client_reference_id\}' = \$1/);
  assert.match(route, /payload #>> '\{data,object,metadata,orderId\}' = \$1/);
  assert.match(route, /persistedStripeWebhookEvidence/);
  assert.match(route, /absence here does not prove that Stripe never collected a payment/);
});

test('webhook evidence report remains read-only and never auto-associates by amount', () => {
  const routeStart = server.indexOf("app.get('/api/admin/orders/:orderId/stripe-candidates', requireAdmin");
  const routeEnd = server.indexOf("\napp.get('/api/admin/orders/review'", routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /automaticAssociation:\s*false/);
  assert.match(route, /databaseModified:\s*false/);
  assert.match(route, /refundCreated:\s*false/);
  assert.match(route, /dtOneCalled:\s*false/);
  assert.doesNotMatch(route, /UPDATE orders|stripe\.refunds\.create|DTONE_API_BASE_URL/);
});
