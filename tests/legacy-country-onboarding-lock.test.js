'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(startMarker, endMarker) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'route boundaries exist: ' + startMarker);
  return server.slice(start, end);
}

test('legacy countries cannot enter the new country-currency, provider-mapping or catalog-import workflow', () => {
  const currencyDiscovery = route("app.post('/api/admin/countries/:countryCode/currency-discovery'", "app.put('/api/admin/countries/:countryCode/destination-currency'");
  const destinationCurrency = route("app.put('/api/admin/countries/:countryCode/destination-currency'", "app.post('/api/admin/countries/:countryCode/dtone-mapping'");
  const providerMapping = route("app.post('/api/admin/countries/:countryCode/dtone-mapping'", "// Customer discovery exposes explicitly active countries");
  const catalogSync = route("app.post('/api/admin/countries/:countryCode/dtone-catalog/sync'", "app.post('/api/admin/fx/rates/refresh'");
  for (const [name, source] of [
    ['currency discovery', currencyDiscovery],
    ['destination currency', destinationCurrency],
    ['DT One mapping', providerMapping],
    ['DT One catalog sync', catalogSync],
  ]) assert.match(source, /legacy/, name + ' must preserve the legacy country path');
});

test('legacy countries cannot be switched to dynamic pricing, operator/product review or activation', () => {
  const checks = [
    ["app.put('/api/admin/countries/:countryCode/pricing'", "app.put('/api/admin/countries/:countryCode/localizations'"),
    ["app.put('/api/admin/countries/:countryCode/operators/:operatorId/localizations'", "app.patch('/api/admin/countries/:countryCode/operators/:operatorId'"),
    ["app.patch('/api/admin/countries/:countryCode/operators/:operatorId'", "app.patch('/api/admin/countries/:countryCode/products/:productId'"),
    ["app.patch('/api/admin/countries/:countryCode/products/:productId'", "app.post('/api/admin/countries/:countryCode/validate'"),
    ["app.post('/api/admin/countries/:countryCode/validate'", "app.post('/api/admin/countries/:countryCode/activate'"),
    ["app.post('/api/admin/countries/:countryCode/activate'", "app.post('/api/admin/countries/:countryCode/disable'"),
    ["app.post('/api/admin/countries/:countryCode/disable'", "// Customer APIs expose only active, reviewed country configuration."),
  ];
  for (const [start, end] of checks) assert.match(route(start, end), /legacy/, start + ' must protect legacy countries');
});

test('legacy pricing remains on pricing_settings; dynamic country pricing cannot silently override it', () => {
  const start = server.indexOf('async function getPricingSettings');
  const end = server.indexOf('async function getVerifiedCountryOperator', start);
  assert.ok(start >= 0 && end > start);
  const pricing = server.slice(start, end);
  assert.ok(pricing.indexOf('FROM pricing_settings') < pricing.indexOf('FROM country_pricing_settings'));
  const adminPricing = route("app.put('/api/admin/countries/:countryCode/pricing'", "app.put('/api/admin/countries/:countryCode/localizations'");
  assert.match(adminPricing, /\['active','legacy'\]\.includes/);
});

test('checkout keeps legacy countries on the original name-based product catalog path', () => {
  const start = server.indexOf('async function getVerifiedCountryOperator');
  const end = server.indexOf('async function getProduct', start);
  assert.ok(start >= 0 && end > start);
  const helper = server.slice(start, end);
  assert.match(helper, /countryStatus === 'legacy'/);
  assert.match(helper, /Legacy countries use the existing operator and product catalog/);
  assert.match(helper, /!\['active','legacy'\]\.includes/);
});

test('customer registry operators and products require a verified DT One country mapping', () => {
  const operators = route("app.get('/api/countries/:countryCode/operators'", "app.get('/api/countries/:countryCode/products'");
  const products = route("app.get('/api/countries/:countryCode/products'", "// Read-only wallet integrity diagnostics.");
  assert.match(operators, /JOIN country_provider_mappings/);
  assert.match(operators, /m\.verification_status='verified'/);
  assert.match(operators, /country\.rows\[0\]\.status === 'legacy'/);
  assert.match(operators, /FROM product_catalog/);
  assert.match(products, /JOIN country_provider_mappings/);
  assert.match(products, /m\.verification_status='verified'/);
  assert.match(products, /country\.rows\[0\]\.status === 'legacy'/);
  assert.match(products, /FROM product_catalog/);
});

test('admin operator listing uses the correct single SQL bind parameter', () => {
  const adminOperators = route("app.get('/api/admin/countries/:countryCode/operators'", "app.get('/api/admin/countries/:countryCode/products'");
  assert.match(adminOperators, /FROM country_operators WHERE country_code=\$1 ORDER BY display_name\s*`, \[code\]\)/);
});
