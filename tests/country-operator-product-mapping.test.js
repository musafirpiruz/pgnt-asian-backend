'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-country-onboarding.html'), 'utf8');

test('registry-backed product lookup requires an active explicit catalog mapping', () => {
  const start = server.indexOf('async function getProduct(');
  const end = server.indexOf('// Calculate the final customer price.', start);
  const lookup = server.slice(start, end);
  assert.match(lookup, /country_operator_products cop/);
  assert.match(lookup, /cop\.product_catalog_id = product_catalog\.id/);
  assert.match(lookup, /cop\.provider_operator_id = co\.provider_operator_id/);
  assert.match(lookup, /cop\.provider_product_id = product_catalog\.product_id::text/);
  assert.match(lookup, /cop\.active = TRUE/);
  assert.match(lookup, /co\.active = TRUE/);
  assert.match(lookup, /options\.operatorKey \|\| null/);
  assert.match(lookup, /amount = \$4 AND \(\$5::text IS NOT NULL OR LOWER\(operator\) = LOWER\(\$3\)\)/);
});

test('both quote and checkout pass verified registry operator identity to catalog lookup', () => {
  const quoteStart = server.indexOf("app.get('/api/pricing/quote'");
  const checkoutStart = server.indexOf("app.post('/api/payments/checkout'");
  const adminStart = server.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout'");
  const quote = server.slice(quoteStart, checkoutStart);
  const checkout = server.slice(checkoutStart, adminStart);
  assert.match(quote, /operatorKey: verifiedOperator \? operatorKey : null/);
  assert.match(checkout, /operatorKey: verifiedOperator \? input\.operatorKey : null/);
});

test('admin mapping endpoint verifies operator and catalog provider IDs and never activates', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/operators/:operatorKey/products'");
  const end = server.indexOf('// New provider mappings are stored disabled', start);
  const route = server.slice(start, end);
  assert.match(route, /provider_operator_id/);
  assert.match(route, /provider_product_id/);
  assert.match(route, /catalog_product_id/);
  assert.match(route, /String\(row\.product_id\) !== providerProductId/);
  assert.match(route, /country_provider_settings/);
  assert.match(route, /verifiedProviderProduct\?\.operator\?\.id/);
  assert.match(route, /providerProductCountry !== String/);
  assert.match(route, /DT One product does not belong to the selected verified operator and country/);
  assert.match(route, /VALUES \(\$1, \$2, \$3, \$4, \$5, FALSE\)/);
  assert.match(route, /activationPerformed: false/);
  assert.match(route, /productActivated: false/);
});

test('migration is additive, idempotent, and leaves all new mappings inactive', () => {
  const start = migration.indexOf('const operatorProductMappingVersion = "019_country_operator_product_mapping"');
  const end = migration.indexOf('// Version 017 introduces a database-backed destination-country registry.', start);
  const block = migration.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /CREATE TABLE IF NOT EXISTS country_operator_products/);
  assert.match(block, /product_catalog_id BIGINT NOT NULL UNIQUE REFERENCES product_catalog\(id\)/);
  assert.match(block, /FOREIGN KEY \(country_code, operator_key\)/);
  assert.match(block, /active BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(block, /ON CONFLICT \(version\) DO NOTHING/);
});

test('admin page can create explicit mappings only from discovered DT One products and existing catalog IDs', () => {
  assert.match(admin, /selectedProviderProduct/);
  assert.match(admin, /catalogProductId/);
  assert.match(admin, /Save explicit operator ↔ catalog mapping \(inactive\)/);
  assert.match(admin, /\/operators\/'\+encodeURIComponent\(operatorKey\)\+'\/products'/);
  assert.match(admin, /provider_product_id:providerProductId/);
  assert.match(admin, /catalog_product_id:catalogProductId/);
});
