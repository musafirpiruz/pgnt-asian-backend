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
  assert.match(route, /createRangedOrderAccessToken\(orderId, accessSecret\)/);
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
});

test('database enforces uniqueness for hashed ranged quote request keys', () => {
  assert.match(migration, /request_key_hash CHAR\(64\)/);
  assert.match(migration, /CREATE UNIQUE INDEX/);
  assert.match(migration, /WHERE request_key_hash IS NOT NULL/);
  assert.doesNotMatch(migration, /request_key_hash[^\n]*raw/i);
});
