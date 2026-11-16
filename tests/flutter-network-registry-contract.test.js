'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('customer operator API exposes the exact Flutter registry contract', () => {
  const route = section(
    server,
    "app.get('/api/countries/:countryCode/operators',",
    "app.get('/api/countries/:countryCode/operators/:operatorKey/products',"
  );
  assert.match(route, /operators:\s*result\.rows\.map/);
  assert.match(route, /operator_key:\s*String\(row\.operator_key\)/);
  assert.match(route, /provider_operator_id:\s*String\(row\.provider_operator_id\)/);
  assert.match(route, /display_name:\s*String\(row\.display_name\)/);

  const loader = section(
    app,
    'Future<void> _loadRegistryOperators(String countryCode) async {',
    'List<int> get amounts =>'
  );
  assert.match(loader, /\/api\/countries\/\$countryCode\/operators/);
  assert.match(loader, /queryParameters:\s*\{'language': requestedLanguage\}/);
  assert.match(loader, /decoded\['operators'\] is! List/);
  assert.match(loader, /item\.operatorKey == null/);
  assert.match(loader, /_registryOperators = parsed/);
  assert.match(loader, /_registryOperators = const \[\]/);
});

test('customer operator API fails closed unless country, network and at least one product are verified and active', () => {
  const route = section(
    server,
    "app.get('/api/countries/:countryCode/operators',",
    "app.get('/api/countries/:countryCode/operators/:operatorKey/products',"
  );
  for (const predicate of [
    "c.status = 'active'",
    'o.active = TRUE',
    'o.verified_at IS NOT NULL',
    'cop.active = TRUE',
    'cop.verified_at IS NOT NULL',
    'p.active = TRUE',
    'p.amount >= 75',
    'p.amount <= 3000',
    'p.wholesale_price_eur_cents > 0',
  ]) assert.ok(route.includes(predicate), `Missing fail-closed predicate: ${predicate}`);
  assert.match(route, /provider_operator_id IS NOT NULL/);
});

test('Flutter operator selector shows loading, empty-state guidance and a retry action', () => {
  const selector = section(
    app,
    'Widget buildOperatorSelector() {',
    'Widget '
  );
  assert.match(selector, /_isLoadingRegistryOperators/);
  assert.match(selector, /DT One تایید شوې شبکې نشته/);
  assert.match(selector, /_loadRegistryOperators\(selectedCountry\.code\)/);
});

test('Flutter verified-product request matches the backend country/operator route and response fields', () => {
  const backend = section(
    server,
    "app.get('/api/countries/:countryCode/operators/:operatorKey/products',",
    '// Public, read-only list of configured payment currencies.'
  );
  const client = section(
    app,
    'Future<void> _loadVerifiedProducts(MobileOperator operator) async {',
    'Future<void> _loadRangedProducts(MobileOperator operator) async {'
  );
  assert.match(client, /\/api\/countries\/\$\{Uri\.encodeComponent\(country\)\}\/operators\/\$\{Uri\.encodeComponent\(key\)\}\/products/);
  assert.match(client, /decoded\['products'\] is! List/);
  assert.match(backend, /products:\s*result\.rows\.map/);
  assert.match(backend, /productId:\s*String\(row\.product_id\)/);
  assert.match(backend, /recipientAmount:\s*Number\(row\.recipient_amount\)/);
  assert.match(backend, /priceEurCents:\s*Number\(row\.price_eur_cents\)/);
});
