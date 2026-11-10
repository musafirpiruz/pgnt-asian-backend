'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migrate = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

function section(startToken, endToken) {
  const start = server.indexOf(startToken);
  const end = server.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, 'expected source section is missing');
  return server.slice(start, end);
}

test('checkout validation accepts a stable operator key without requiring a localized operator label', () => {
  const validator = section('function validateCheckoutInput(body)', '// =====================================================\n// PART 3/8');
  assert.match(validator, /body\.operatorKey/);
  assert.match(validator, /operatorKey/);
  assert.match(validator, /operatorKey,\s*amount/);
  assert.match(validator, /operatorKey && \(!\/\^\[a-zA-Z0-9\._:-\]/);
});

test('registry product resolution uses server-side verified mapping and parameterized stable key', () => {
  const resolver = section('async function getProduct(', '// Calculate the final customer price.');
  for (const token of [
    'country_operator_products', 'product_catalog', 'country_registry',
    'o.operator_key = $2', 'cop.verified_at IS NOT NULL',
    'o.verified_at IS NOT NULL', 'p.amount = $3',
    'p.currency = c.destination_currency',
  ]) assert.ok(resolver.includes(token), 'missing secure resolver rule: ' + token);
  assert.doesNotMatch(resolver, /providerOperatorId|req\.body/);
});

test('quote and checkout both pass operatorKey to the same server resolver', () => {
  const quote = section("app.get('/api/pricing/quote'", '// =====================================================\n// PART 4/8');
  const checkout = section("app.post('/api/payments/checkout'", "app.post('/api/admin/stripe-dtone/sandbox-checkout'");
  assert.match(quote, /operatorKey: operatorKey \|\| null/);
  assert.match(checkout, /operatorKey: input\.operatorKey \|\| null/);
});

test('operator listing excludes operators without active verified product mappings', () => {
  const route = section("app.get('/api/countries/:countryCode/operators'", '// Public, read-only list of configured payment currencies.');
  assert.match(route, /EXISTS\s*\([\s\S]*country_operator_products[\s\S]*cop\.active = TRUE[\s\S]*cop\.verified_at IS NOT NULL/);
  assert.match(route, /localized\.operator_id = o\.id/);
  assert.doesNotMatch(route, /localized\.country_code|localized\.operator_key/);
});

test('mapping migration is deferred until registry tables exist and never seeds or activates mappings', () => {
  const start = migrate.indexOf('const operatorProductMappingVersion');
  const end = migrate.indexOf('} catch (error) {', start);
  assert.ok(start >= 0 && end > start);
  const migration = migrate.slice(start, end);
  assert.match(migration, /to_regclass\('country_registry'\)/);
  assert.match(migration, /to_regclass\('country_operators'\)/);
  assert.match(migration, /REFERENCES country_operators\(country_code, operator_key\)/);
  assert.match(migration, /active BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /verified_at TIMESTAMPTZ/);
  assert.doesNotMatch(migration, /INSERT INTO country_operator_products/i);
  assert.doesNotMatch(migration, /UPDATE country_operator_products/i);
});

test('exact catalog product ID takes precedence and is country-scoped', () => {
  const resolver = section('async function getProduct(', '// Calculate the final customer price.');
  assert.match(resolver, /if \(productId !== null && productId !== undefined/);
  assert.match(resolver, /WHERE id = \$1::bigint AND country = \$2/);
  assert.match(resolver, /else if \(options\.operatorKey\)/);
});

test('quote endpoint accepts exact productId without legacy operator and amount', () => {
  const quote = section("app.get('/api/pricing/quote'", '// =====================================================\\n// PART 4/8');
  assert.match(quote, /req\.query\.productId/);
  assert.match(quote, /validProductId/);
  assert.match(quote, /validProductId \? productId : null/);
});

test('checkout accepts productId alone and rejects mixed identity inputs', () => {
  const validator = section('function validateCheckoutInput(body)', '// =====================================================\\n// PART 3/8');
  assert.match(validator, /if \(productId && operatorKey\)/);
  assert.match(validator, /if \(!productId && \(/);
});
