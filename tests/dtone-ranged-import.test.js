'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('ranged discovery imports only a freshly verified DT One product detail', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/import', requireAdmin");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/products\/\$\{encodeURIComponent\(productId\)\}/);
  assert.match(route, /String\(product\.id\) !== productId/);
  assert.match(route, /parseRangedProductCapability\(product\)/);
  assert.match(route, /providerCountry !== countryIsoCode/);
  assert.match(route, /destinationCurrency !== countryCurrencyByIso\[countryIsoCode\]/);
});

test('ranged product import is admin-only, disabled, and transaction-free', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/import', requireAdmin");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  const route = server.slice(start, end);
  assert.match(route, /active, created_at, updated_at/);
  assert.match(route, /NOW\(\), FALSE, NOW\(\), NOW\(\)/);
  assert.match(route, /active = FALSE/);
  assert.match(route, /productsRemainDisabled: true/);
  assert.match(route, /transactionCreated: false/);
  assert.match(route, /paymentCreated: false/);
  assert.doesNotMatch(route, /POST.*\/v1\/transactions|stripe\.checkout\.sessions\.create/i);
});

test('ranged import refuses to run before migration 018 exists', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/import', requireAdmin");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  const route = server.slice(start, end);
  assert.match(route, /to_regclass\('dtone_ranged_products'\)/);
  assert.match(route, /Ranged product migration 018 is not applied/);
});

test('customer discovery uses the shared exact increment validator for ranged products', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin");
  const end = server.indexOf("app.post('/api/admin/dtone/ranged-products/import', requireAdmin", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /parseRangedProductCapability\(product\)/);
  assert.match(route, /isValidRangedDestinationAmount\(amountQuery, rangedCapability\)/);
  assert.match(route, /const amountMatches = isRanged \? rangeAmountMatch : exactAmountMatch/);
  assert.match(route, /rangeCapabilityVerified: Boolean\(rangedCapability\)/);
});
