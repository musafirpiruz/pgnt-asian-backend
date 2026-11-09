'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('public country operator registry route uses canonical country and operator tables', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf('// Public, read-only list of configured payment currencies.', start);
  assert.ok(start >= 0 && end > start, 'registry route must exist before payment currency routes');
  const route = server.slice(start, end);
  for (const token of [
    'country_registry', 'country_operators', 'country_operator_localizations',
    'operator_key', 'provider_operator_id', 'display_name',
    "c.status = 'active'", 'o.active = TRUE', 'o.verified_at IS NOT NULL',
    'REGISTRY_LANGUAGES', 'res.status(503)',
  ]) assert.ok(route.includes(token), 'missing safe registry contract: ' + token);
});

test('country operator API never exposes unverified or client-supplied provider mappings', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf('// Public, read-only list of configured payment currencies.', start);
  const route = server.slice(start, end);
  assert.match(route, /o\.provider_operator_id IS NOT NULL/);
  assert.match(route, /BTRIM\(o\.provider_operator_id\) <> ''/);
  assert.match(route, /o\.verified_at IS NOT NULL/);
  assert.doesNotMatch(route, /req\.body|INSERT INTO|UPDATE\s+country_/i);
  assert.match(route, /\[countryCode, language\]/);
});
