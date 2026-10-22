// Source-level regression checks for DT One callback safety.
// These tests do not call DT One, Stripe, or the database.
// Run with: node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const callbackStart = server.indexOf("app.post('/api/dtone/callback'");
const callbackEnd = server.indexOf('// Mark a failed asynchronous Stripe payment', callbackStart);
const callback = callbackStart >= 0 && callbackEnd > callbackStart
  ? server.slice(callbackStart, callbackEnd)
  : '';

test('DT One callback route exists and authenticates before processing the payload', () => {
  assert.notEqual(callbackStart, -1, 'DT One callback route must exist');
  assert.match(callback.slice(0, 1800), /verifyDtOneCallback\(req\)/);
  assert.match(callback.slice(0, 2200), /status\(401\)/);
});

test('callback rejects missing references and unknown provider statuses', () => {
  assert.match(callback, /Missing transaction reference/);
  assert.match(callback, /Unrecognized transaction status/);
  assert.match(callback, /providerStatus === 'unknown'/);
});

test('ordinary customer orders require verified Stripe payment evidence', () => {
  assert.match(callback, /if \(\(!order\.paid_at \|\| !order\.stripe_payment_intent_id\) && !isolatedSandboxTestOrder\)/);
  assert.match(callback, /Order has no verified Stripe payment evidence/);
  assert.ok(callback.indexOf("Order has no verified Stripe payment evidence") < callback.indexOf("let nextStatus"));
});

test('only the isolated ATOMA sandbox test order on the exact DT One pre-production host bypasses Stripe evidence', () => {
  assert.match(callback, /order\.operator === 'ATOMA-SANDBOX-TEST'/);
  assert.match(callback, /callbackBaseUrl\.hostname === 'preprod-dvs-api\.dtone\.com'/);
  assert.match(callback, /callbackBaseUrl\.protocol === 'https:'/);
  assert.match(callback, /isolatedSandboxTestOrder = false/);
  assert.match(callback, /\(!order\.paid_at \|\| !order\.stripe_payment_intent_id\) && !isolatedSandboxTestOrder/);
});

test('callback locks the order and rejects mismatched provider transaction IDs', () => {
  assert.match(callback, /FOR UPDATE/);
  assert.match(callback, /Transaction reference mismatch/);
  assert.match(callback, /String\(order\.dtone_transaction_id\)/);
});

test('duplicate callback for a completed order does not re-fulfill it', () => {
  assert.match(callback, /order\.status === 'completed'/);
  assert.match(callback, /duplicate: true/);
  assert.match(callback, /status: 'completed'/);
  assert.doesNotMatch(callback, /processPaidStripeSession/);
});

test('provider completion is distinguished from failure and pending status', () => {
  assert.match(callback, /providerStatus === 'completed'/);
  assert.match(callback, /nextStatus = 'completed'/);
  assert.match(callback, /nextStatus = 'topup_review'/);
  assert.match(callback, /order\.status === 'topup_review'/);
});

test('callback writes status and payload transactionally', () => {
  assert.match(callback, /client\.query\('BEGIN'\)/);
  assert.match(callback, /dtone_callback_payload = \$4::jsonb/);
  assert.match(callback, /client\.query\('COMMIT'\)/);
  assert.match(callback, /client\.query\('ROLLBACK'\)/);
});

test('these checks are source-only and do not execute external side effects', () => {
  assert.doesNotMatch(fs.readFileSync(__filename, 'utf8'), /fetch\(|stripe\.refunds\.create/);
});
