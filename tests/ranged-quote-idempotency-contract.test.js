'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '021_ranged_quote_idempotency.sql'),
  'utf8'
);

test('ranged quote endpoint requires an idempotency key before creating a provider reservation', () => {
  const start = server.indexOf("app.post('/api/ranged-quotes'");
  const end = server.indexOf("app.get('/api/pricing/quote'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /req\.get\('Idempotency-Key'\)/);
  assert.match(route, /hashRangedIdempotencyKey\(idempotencyHeader\)/);
  assert.match(route, /request_key_hash, request_fingerprint/);
  assert.match(route, /WHERE r\.request_key_hash = \$1/);
  assert.match(route, /createRangedOrderAccessToken\(orderId, ORDER_ACCESS_TOKEN_SECRET\)/);
  assert.match(route, /createRangedTransaction\(/);
});

test('Flutter keeps the same ranged quote key on retry and accepts idempotent replay', () => {
  const start = app.indexOf("Uri.parse('$backendBaseUrl/api/ranged-quotes')");
  const end = app.indexOf('final Map<String, dynamic> checkoutBody', start);
  assert.ok(start >= 0 && end > start);
  const flow = app.slice(start, end);
  assert.match(flow, /'Idempotency-Key': _rangedIdempotencyKey!/);
  assert.match(flow, /statusCode != 201 && rangedResponse\.statusCode != 200/);
  assert.match(app, /_rangedRequestFingerprint != requestFingerprint/);
  assert.match(app, /_secureStorage\.write\(/);
  assert.match(app, /_secureStorage\.read\(/);
});

test('database enforces uniqueness for hashed ranged quote request keys', () => {
  assert.match(migration, /request_key_hash CHAR\(64\)/);
  assert.match(migration, /CREATE UNIQUE INDEX/);
  assert.match(migration, /WHERE request_key_hash IS NOT NULL/);
  assert.doesNotMatch(migration, /request_key_hash[^\n]*raw/i);
});

test('ranged checkout retries return the same still-open Stripe session', () => {
  const start = server.indexOf("app.post('/api/payments/checkout'");
  const end = server.indexOf("// Create a checkout session and store its order.", start);
  assert.ok(start >= 0);
  const route = server.slice(start, end > start ? end : start + 12000);
  assert.match(route, /order\.status === 'awaiting_payment' && order\.stripe_session_id/);
  assert.match(route, /stripe\.checkout\.sessions\.retrieve\(order\.stripe_session_id\)/);
  assert.match(route, /existingSession\.status === 'open'/);
  assert.match(route, /Number\(existingSession\.amount_total\) === Number\(order\.charge_cents\)/);
});


test('ranged quote endpoint is rate limited and uses a dedicated access-token secret', () => {
  assert.match(server, /app\.set\('trust proxy', 1\)/);
  assert.match(server, /enforceRangedQuoteRateLimit/);
  assert.match(server, /\) > 10/);
  assert.match(server, /ORDER_ACCESS_TOKEN_SECRET\.length < 32/);
  assert.doesNotMatch(server, /ORDER_ACCESS_TOKEN_SECRET \|\| STRIPE_SECRET_KEY/);
});

test('database migration creates the distributed ranged quote rate-limit table', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ranged_quote_rate_limits/);
  assert.match(migration, /bucket_hash CHAR\(64\) PRIMARY KEY/);
  assert.match(migration, /request_count INTEGER NOT NULL/);
});
