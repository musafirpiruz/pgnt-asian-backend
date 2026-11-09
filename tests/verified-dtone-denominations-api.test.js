'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('fixed denomination discovery is backed only by active verified DT One mappings', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators/:operatorKey/products'");
  const end = server.indexOf('// Public, read-only list of configured payment currencies.', start);
  assert.ok(start >= 0 && end > start, 'verified product discovery route must exist');
  const route = server.slice(start, end);
  for (const token of [
    'country_registry', 'country_operators', 'country_operator_products',
    'product_catalog', "c.status = 'active'", 'o.active = TRUE',
    'o.verified_at IS NOT NULL', 'cop.active = TRUE',
    'cop.provider_operator_id = o.provider_operator_id',
    'cop.provider_product_id = p.product_id::text',
    'p.active = TRUE', 'p.amount IS NOT NULL',
    'ORDER BY p.amount ASC',
  ]) assert.ok(route.includes(token), 'missing verified catalog condition: ' + token);
});

test('fixed denomination discovery is read-only and validates path identifiers', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators/:operatorKey/products'");
  const end = server.indexOf('// Public, read-only list of configured payment currencies.', start);
  const route = server.slice(start, end);
  assert.match(route, /\^\[A-Z\]\{2\}\$/);
  assert.match(route, /\^\[a-zA-Z0-9\._:-\]\{2,100\}\$/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE\s+product_catalog|DELETE FROM/i);
  assert.match(route, /\[countryCode, operatorKey\]/);
  assert.match(route, /res\.status\(503\)/);
});
