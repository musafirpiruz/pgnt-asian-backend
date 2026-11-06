'use strict';

// Source-only regression tests for the admin DT One reconciliation gate.
// These tests never call Stripe, DT One, PostgreSQL, or external services.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf("app.post('/api/admin/dtone/reconcile-status'");
const end = server.indexOf("app.post('/api/dtone/callback'", start);
const route = start >= 0 && end > start ? server.slice(start, end) : '';

test('admin reconciliation endpoint is explicit and sandbox-only', () => {
  assert.notEqual(start, -1);
  assert.match(route, /requireAdmin/);
  assert.match(route, /confirmReconcile !== true/);
  assert.match(route, /ATOMA-SANDBOX-TEST/);
  assert.match(route, /sk_test_/);
  assert.match(route, /isDtOnePreproductionConfigured/);
});

test('reconciliation performs a provider GET only and never submits a top-up', () => {
  assert.match(route, /method: 'GET'/);
  assert.match(route, /\/v1\/transactions\//);
  assert.doesNotMatch(route, /method: 'POST'/);
  assert.doesNotMatch(route, /auto_confirm/);
  assert.doesNotMatch(route, /processPaidStripeSession/);
});

test('provider transaction ID and external order ID must both match exactly', () => {
  assert.match(route, /providerId !== String\(saved\.dtone_transaction_id\)/);
  assert.match(route, /providerExternalId !== orderId/);
  assert.match(route, /no local status was changed/);
});

test('unknown status, refund reservation, and changed transaction fail closed', () => {
  assert.match(route, /providerStatus === 'unknown'/);
  assert.match(route, /FROM refunds WHERE order_id = \$1/);
  assert.match(route, /Saved DT One transaction changed during reconciliation/);
});

test('final provider status is persisted transactionally and repeated success is safe', () => {
  assert.match(route, /client\.query\('BEGIN'\)/);
  assert.match(route, /providerStatus === 'completed'/);
  assert.match(route, /nextStatus = 'completed'/);
  assert.match(route, /order\.status !== 'completed'/);
  assert.match(route, /dtone_callback_payload = \$3::jsonb/);
  assert.match(route, /client\.query\('COMMIT'\)/);
  assert.match(route, /client\.query\('ROLLBACK'\)/);
});

test('response confirms no new top-up was created or retried', () => {
  assert.match(route, /topupCreated: false/);
  assert.match(route, /topupRetried: false/);
});

test('admin page exposes an explicit sandbox-only reconciliation control', () => {
  assert.match(server, /id="confirmDtOneReconcile"/);
  assert.match(server, /id="reconcileDtOneStatus"/);
  assert.match(server, /confirmReconcile:true/);
  assert.match(server, /\/api\/admin\/dtone\/reconcile-status/);
});


test('numeric DT One transaction IDs are accepted and nonnumeric IDs are rejected', () => {
  const numericIdGuard = "!/^\\d+$/.test(String(saved.dtone_transaction_id))";
  assert.ok(route.includes(numericIdGuard), 'route must use a single-backslash decimal digit regex');
  const transactionIdPattern = /^\d+$/;
  assert.equal(transactionIdPattern.test('2240961013'), true);
  assert.equal(transactionIdPattern.test('2240961013x'), false);
  assert.equal(transactionIdPattern.test(''), false);
});
