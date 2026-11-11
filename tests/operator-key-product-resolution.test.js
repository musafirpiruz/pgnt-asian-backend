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

test('checkout validation requires an exact internal catalog product ID', () => {
  const validator = section('function validateCheckoutInput(body)', '// =====================================================\n// PART 3/8');
  assert.match(validator, /body\.productId/);
  assert.match(validator, /!\/\^\[1-9\]\\d\*\$\//);
  assert.match(validator, /Select a valid catalog product/);
  assert.doesNotMatch(validator, /body\.operatorKey|body\.operator|body\.amount/);
});

test('product resolution uses exact internal catalog ID and verified provider mapping only', () => {
  const resolver = section('async function getProduct(', '// Calculate the final customer price.');
  for (const token of [
    'p.id = $1::bigint', 'p.country = $2', 'country_operator_products',
    'cop.active = TRUE', 'cop.verified_at IS NOT NULL',
    'o.verified_at IS NOT NULL', 'p.wholesale_price_eur_cents > 0',
  ]) assert.ok(resolver.includes(token), 'missing exact verified product rule: ' + token);
  assert.doesNotMatch(resolver, /p\.amount\s*=|operatorKey|LOWER\(operator\)/);
});

test('quote and checkout require exact productId and never resolve by denomination', () => {
  const quote = section("app.get('/api/pricing/quote'", '// =====================================================\n// PART 4/8');
  const checkout = section("app.post('/api/payments/checkout'", "app.post('/api/admin/stripe-dtone/sandbox-checkout'");
  assert.match(quote, /req\.query\.productId/);
  assert.match(quote, /getProduct\(client, productId, country/);
  assert.doesNotMatch(quote, /req\.query\.operator|req\.query\.amount|operatorKey/);
  assert.match(checkout, /input\.productId/);
  assert.doesNotMatch(checkout, /input\.operatorKey|input\.amount/);
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

test('same-denomination DT One products remain independently selectable by catalog ID', () => {
  const resolver = section('async function getProduct(', '// Calculate the final customer price.');
  assert.match(resolver, /WHERE p\.id = \$1::bigint[\s\S]*AND p\.country = \$2/);
  assert.doesNotMatch(resolver, /p\.amount\s*=|LOWER\(p\.operator\)|LIMIT 1/);
  assert.match(resolver, /cop\.product_catalog_id = p\.id/);
});

test('quote endpoint rejects legacy operator and amount-only selection', () => {
  const quote = section("app.get('/api/pricing/quote'", '// =====================================================\n// PART 4/8');
  assert.match(quote, /req\.query\.productId/);
  assert.match(quote, /!\/\^\[1-9\]\\d\*\$\//);
  assert.doesNotMatch(quote, /req\.query\.operator|req\.query\.amount|operatorKey/);
});

test('Flutter checkout sends only exact productId after quote validation', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  const checkoutIndex = app.indexOf('/api/payments/checkout');
  assert.ok(checkoutIndex >= 0, 'checkout endpoint must exist in Flutter source');
  const checkout = app.slice(checkoutIndex, checkoutIndex + 2200);
  const requestBody = checkout.slice(checkout.indexOf('body: jsonEncode({'), checkout.indexOf('}),', checkout.indexOf('body: jsonEncode({')) + 3);
  assert.match(requestBody, /'productId': _selectedProduct!\.productId/);
  assert.doesNotMatch(requestBody, /'operatorKey'|'operator'|'amount'/);
});

test('Flutter checkout sends exact productId without conflicting operator/amount identity', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  const checkoutIndex = app.indexOf('/api/payments/checkout');
  assert.ok(checkoutIndex >= 0, 'checkout endpoint must exist in Flutter source');
  const checkout = app.slice(checkoutIndex - 300, checkoutIndex + 5000);
  assert.match(checkout, /if \(priceQuote\?\['productId'\] != null\)/);
  assert.match(checkout, /'productId': priceQuote!\['productId'\]\.toString\(\)/);
  assert.match(checkout, /else \.\.\./);
});


test('customer product list returns only active products with fully verified country/operator/product mappings', () => {
  const route = section(
    "app.get('/api/countries/:countryCode/operators/:operatorKey/products'",
    '// Public, read-only list of configured payment currencies.'
  );
  for (const token of [
    'country_registry', 'country_operators', 'country_operator_products',
    'p.product_id AS provider_product_id', 'p.id AS product_id',
    'o.provider_operator_id IS NOT NULL', 'o.verified_at IS NOT NULL',
    'cop.active = TRUE', 'cop.verified_at IS NOT NULL',
    'p.active = TRUE', 'p.wholesale_price_eur_cents > 0',
    'p.country = c.country_code', 'c.destination_currency = p.currency',
    'ORDER BY p.amount, p.id',
  ]) assert.ok(route.includes(token), 'missing verified product-list rule: ' + token);
  assert.doesNotMatch(route, /INSERT\s+INTO|UPDATE\s+product_catalog|DELETE\s+FROM/i);
});

test('customer product list validates country/operator path and returns exact catalog product identity', () => {
  const route = section(
    "app.get('/api/countries/:countryCode/operators/:operatorKey/products'",
    '// Public, read-only list of configured payment currencies.'
  );
  assert.match(route, /normalizeCountry\(req\.params\.countryCode\)/);
  assert.match(route, /operatorKey\)\)/);
  assert.match(route, /productId: String\(row\.product_id\)/);
  assert.match(route, /providerProductId: String\(row\.provider_product_id\)/);
  assert.match(route, /paymentCurrency: 'EUR'/);
  assert.match(route, /REGISTRY_LANGUAGES\.has/);
});



test('Flutter entry source contains one authoritative home page and one state class', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  assert.equal(app.split('class PgntHomePage extends StatefulWidget').length - 1, 1);
  assert.equal(app.split('class _PgntHomePageState extends State<PgntHomePage>').length - 1, 1);
  assert.equal(app.split('Widget pgntSectionTitle(').length - 1, 1);
  assert.equal(app.split('Widget pgntGoldDivider(').length - 1, 1);
});

test('Flutter main source has no duplicate top-level class declarations', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  const names = app.split('\\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('class '))
    .map((line) => line.split(/\\s+/)[1]);
  assert.equal(new Set(names).size, names.length, 'duplicate top-level class declaration found');
});

test('Flutter selects only verified catalog products and quotes by exact productId', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  assert.ok(app.includes('class CatalogTopUpProduct'));
  assert.ok(app.includes('/operators/'));
  assert.ok(app.includes('/products'));
  assert.ok(app.includes('CatalogTopUpProduct.fromJson'));
  assert.ok(app.includes('buildVerifiedProductSelector()'));
  assert.ok(app.includes("'country': countryCode, 'productId': productId"));
  assert.ok(app.includes('_selectedProduct == null'));
  assert.ok(!app.includes('Widget buildCustomAmountField()'));
});
