'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('customer ranged catalog exposes only active, verified DT One destination-amount capabilities', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/ranged-products'");
  const end = server.indexOf("// Import one verified DT One ranged recharge capability", start);
  assert.ok(start >= 0 && end > start, 'customer ranged catalog route must exist');
  const route = server.slice(start, end);

  assert.match(route, /rp\.active = TRUE/);
  assert.match(route, /rp\.capability_verified_at IS NOT NULL/);
  assert.match(route, /rp\.accepted_calculation_modes \? 'DESTINATION_AMOUNT'/);
  assert.match(route, /rp\.min_amount <= 3000/);
  assert.match(route, /rp\.max_amount >= 75/);
  assert.match(route, /cr\.destination_currency = rp\.destination_currency/);
  assert.match(route, /cr\.status = 'active'/);
  assert.match(route, /cr\.provider = 'dtone'/);
  assert.match(route, /cr\.provider_country_code = \$1/);
  assert.match(route, /countryRegistryRuntime\.getFreshSnapshot\(\)/);
  assert.match(route, /countryConfig\.providerCountryCode/);
  assert.doesNotMatch(route, /providerCountryCodes/);
  assert.doesNotMatch(route, /wholesale_price_range|provider_snapshot|wholesale_amount/);
});

test('customer ranged catalog clamps selectable bounds to 75–3000 without ignoring provider increments', () => {
  function bounds(minimum, maximum, increment) {
    const min = minimum + Math.ceil((Math.max(minimum, 75) - minimum) / increment) * increment;
    const cappedMax = Math.min(maximum, 3000);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(cappedMax) ||
        !Number.isSafeInteger(increment) || increment <= 0 || min < 75 || min > cappedMax) {
      return null;
    }
    return {
      min,
      max: min + Math.floor((cappedMax - min) / increment) * increment,
      increment,
    };
  }

  assert.deepEqual(bounds(50, 5000, 5), { min: 75, max: 3000, increment: 5 });
  assert.deepEqual(bounds(100, 2000, 25), { min: 100, max: 2000, increment: 25 });
  assert.deepEqual(bounds(80, 1000, 30), { min: 80, max: 980, increment: 30 });
  assert.equal(bounds(3005, 5000, 5), null);
  assert.equal(bounds(75, 74, 1), null);
});

test('customer ranged catalog returns only public product identity and amount capability', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/ranged-products'");
  const end = server.indexOf("// Import one verified DT One ranged recharge capability", start);
  const route = server.slice(start, end);
  assert.match(route, /productId: String\(row\.dtone_product_id\)/);
  assert.match(route, /operator: String\(row\.operator_name\)/);
  assert.match(route, /currency: String\(row\.destination_currency\)/);
  assert.match(route, /minAmount: min/);
  assert.match(route, /maxAmount: lastValid/);
  assert.match(route, /increment/);
  assert.match(route, /products: \[\]/);
});
test('customer ranged catalog scopes results to the selected operator with a parameterized filter', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/ranged-products'");
  const end = server.indexOf('// Import one verified DT One ranged recharge capability', start);
  const route = server.slice(start, end);
  assert.match(route, /const operatorFilter = String\(req\.query\.operator \|\| ''\)\.trim\(\)/);
  assert.match(route, /operatorFilter\.length > 160/);
  assert.match(route, /LOWER\(rp\.operator_name\) = LOWER\(\$3\)/);
  assert.match(route, /\[providerCountryCode, countryCode, operatorFilter\]/);
});


test('ranged order identity migration is registered as an additive version and preserves fixed orders', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  const start = migration.indexOf('const rangedOrderIdentityVersion = "019_ranged_order_identity"');
  const end = migration.indexOf('console.log("Migration 019_ranged_order_identity is already applied.")', start);
  assert.ok(start >= 0 && end > start, 'version 019 must be registered in the explicit migration runner');
  const block = migration.slice(start, end);
  assert.match(block, /DEFAULT 'FIXED'/);
  assert.match(block, /ALTER COLUMN product_id DROP NOT NULL/);
  assert.match(block, /fulfillment_type = 'FIXED'[\s\S]*product_id IS NOT NULL[\s\S]*ranged_product_id IS NULL/);
  assert.match(block, /fulfillment_type = 'RANGED'[\s\S]*product_id IS NULL[\s\S]*ranged_product_id IS NOT NULL/);
  assert.match(block, /REFERENCES dtone_ranged_products\(dtone_product_id\)/);
  assert.match(block, /ON DELETE RESTRICT/);
  assert.match(block, /BEGIN/);
  assert.match(block, /COMMIT/);
  assert.match(block, /ROLLBACK/);
  assert.doesNotMatch(block, /UPDATE orders[\s\S]*SET fulfillment_type = 'RANGED'/);
});

test('ranged order identity migration is not automatically applied at server startup', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/ranged-products'");
  const startup = server.slice(0, start);
  assert.doesNotMatch(startup, /runMigration\(|019_ranged_order_identity/);
});

test('country registry runtime is initialized from the database pool and fails closed without a pool', () => {
  assert.match(server, /const countryRegistryRuntime = pool[\s\S]*createCountryRegistryRuntime\(\{ pool, maxAgeMs: 60_000 \}\)/);
  assert.match(server, /countryRegistryRuntime\.getFreshSnapshot\(\)/);
});


test('admin DT One catalog country resolution uses only unique explicit country_registry mappings', () => {
  const helperStart = server.indexOf('async function resolveDtOneCountryMapping(');
  const helperEnd = server.indexOf('// One standard customer payment currency.', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'registry mapping resolver must exist');
  const helper = server.slice(helperStart, helperEnd);
  assert.match(helper, /FROM country_registry/);
  assert.match(helper, /provider = 'dtone'/);
  assert.match(helper, /provider_country_code = \$1/);
  assert.match(helper, /result\.rowCount !== 1/);
  assert.match(helper, /destination_currency/);

  const refreshStart = server.indexOf("app.post('/api/admin/catalog/:productId/refresh-prices'");
  const importStart = server.indexOf("app.post('/api/admin/catalog/:productId/import'");
  const syncStart = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country'");
  const operatorsStart = server.indexOf("app.get('/api/admin/dtone/operators'");
  assert.ok(refreshStart >= 0 && importStart > refreshStart && syncStart > importStart && operatorsStart > syncStart);
  const refresh = server.slice(refreshStart, importStart);
  const importRoute = server.slice(importStart, syncStart);
  const sync = server.slice(syncStart, operatorsStart);
  for (const route of [refresh, importRoute, sync]) {
    assert.match(route, /resolveDtOneCountryMapping\(/);
    assert.doesNotMatch(route, /countryMap\s*=\s*(?:Object\.freeze\()?\s*\{\s*AFG:/);
  }
  assert.match(refresh, /countryMapping\.destinationCurrency/);
  assert.match(importRoute, /countryMapping\.destinationCurrency/);
  assert.match(sync, /recipientCurrency = countryMapping\.destinationCurrency/);
  assert.match(sync, /currency !== recipientCurrency/);
});

test('ranged DT One capability import resolves destination currency from country_registry', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/import'");
  const end = server.indexOf('//', start + 20);
  assert.ok(start >= 0);
  const route = server.slice(start, server.indexOf("app.", start + 20) > 0 ? server.indexOf("app.", start + 20) : server.length);
  assert.match(route, /resolveDtOneCountryMapping\(countryIsoCode\)/);
  assert.match(route, /destinationCurrency !== countryMapping\.destinationCurrency/);
  assert.doesNotMatch(route, /countryCurrencyByIso/);
});

test('DT One operator discovery accepts only provider countries explicitly mapped in the registry', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/operators'");
  const end = server.indexOf("app.get('/api/admin/dtone/products'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /resolveDtOneCountryMapping\(countryIsoCode\)/);
  assert.match(route, /No unique DT One provider-country mapping/);
  assert.doesNotMatch(route, /supportedOperatorCountries|AFG, PAK, IND, or BGD/);
});
