'use strict';

// Source-level safety checks only; no live DB, Stripe, refund, or DT One calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('declined sandbox archive endpoint requires explicit no-payment confirmation and a review note', () => {
  const start = server.indexOf("app.post('/api/admin/orders/:orderId/archive-declined-sandbox', requireAdmin");
  const end = server.indexOf("\n// Full Stripe refund", start);
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const route = server.slice(start, end);
  assert.match(route, /confirmNoStripePayment !== true/);
  assert.match(route, /reason\.length < 12/);
  assert.match(route, /operator !== 'ATOMA-SANDBOX-TEST'/);
  assert.match(route, /status !== 'topup_review'/);
  assert.match(route, /toUpperCase\(\) !== 'DECLINED'/);
  assert.match(route, /stripe_session_id \|\| order\.stripe_payment_intent_id/);
});

test('archiving preserves order and financial state, with no refund or provider call', () => {
  const start = server.indexOf("app.post('/api/admin/orders/:orderId/archive-declined-sandbox', requireAdmin");
  const end = server.indexOf("\n// Full Stripe refund", start);
  const route = server.slice(start, end);
  assert.match(route, /SET archived_at = NOW\(\), archived_reason = \$2/);
  assert.doesNotMatch(route, /DELETE FROM orders|SET status\s*=|stripe\.refunds\.create|DTONE_API_BASE_URL|submitTopup/);
  assert.match(route, /deleted: false/);
  assert.match(route, /refundCreated: false/);
  assert.match(route, /dtOneCalled: false/);
});

test('review queue excludes archived orders but returns archive audit fields', () => {
  const start = server.indexOf("app.get('/api/admin/orders/review', requireAdmin");
  const end = server.indexOf("\n// Archive only a declined ATOMA sandbox order", start);
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const route = server.slice(start, end);
  assert.match(route, /archived_at IS NULL/);
  assert.match(route, /archived_reason/);
});

test('migration adds nullable archive metadata and a partial review index idempotently', () => {
  assert.match(migration, /014_declined_sandbox_order_archive/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_reason TEXT/);
  assert.match(migration, /WHERE archived_at IS NULL/);
});
