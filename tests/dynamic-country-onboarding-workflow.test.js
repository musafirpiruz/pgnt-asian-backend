'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('DT One country discovery is paginated, read-only, and never activates a country', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/countries'");
  const end = server.indexOf('// Database-backed country onboarding.', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/countries/);
  assert.match(route, /per_page/);
  assert.match(route, /maxPages = 20/);
  assert.match(route, /complete: !truncated/);
  assert.match(route, /readOnly: true/);
  assert.match(route, /transactionCreated: false/);
  assert.doesNotMatch(route, /INSERT INTO country_registry|UPDATE country_registry|POST.*\/v1\/transactions/i);
});

test('provider country mapping is verified against DT One before it is saved', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/dtone-mapping'");
  const end = server.indexOf('// Customer discovery exposes only active country configuration.', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/countries/);
  assert.match(route, /providerCountryCode/);
  assert.match(route, /verification_status/);
  assert.match(route, /country_mapping_verified/);
  assert.match(route, /countryStatus: local\.rows\[0\]\.status/);
  assert.match(route, /customerVisible: false/);
});

test('dynamic catalog sync checks both price currency units and refuses stale FX', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/dtone-catalog/sync'");
  const end = server.indexOf("app.post('/api/admin/fx/rates/refresh'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /prices\?\.wholesale\?\.unit/);
  assert.match(route, /prices\?\.retail\?\.unit/);
  assert.match(route, /retailCurrency !== wholesaleCurrency/);
  assert.match(route, /expires_at>NOW\(\)/);
  assert.match(route, /observed_at>=NOW\(\)-INTERVAL '5 days'/);
  assert.match(route, /catalog_status/);
  assert.match(route, /'disabled'/);
  assert.match(route, /price_currency_verified/);
  assert.match(route, /confirmImport/);
  assert.match(route, /productsRemainDisabled: true/);
  assert.match(route, /transactionCreated: false/);
  assert.doesNotMatch(route, /catalog_status='active'|active\s*=\s*TRUE/i);
});

test('FX rates have source provenance, freshness and rejected quotes do not create fake rates', () => {
  const start = migration.indexOf('const globalFxVersion = "018_global_provider_currency_fx"');
  const end = migration.indexOf('const countryPricingVersion', start);
  assert.ok(start >= 0 && end > start);
  const schema = migration.slice(start, end);
  assert.match(schema, /fx_currency_rates/);
  assert.match(schema, /fx_currency_rate_history/);
  assert.match(schema, /CHECK \(\(accepted = TRUE AND units_per_eur > 0\) OR \(accepted = FALSE AND units_per_eur IS NULL\)\)/);
  assert.match(server, /function refreshFxCurrencyRate/);
  assert.match(server, /5 \* 86400000/);
  assert.match(server, /24 \* 60 \* 60 \* 1000/);
  assert.match(server, /previous saved rate was preserved/);
});

test('country preflight requires provider, phone, operator, product, pricing, FX and six translations', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/validate'");
  const end = server.indexOf("app.post('/api/admin/countries/:countryCode/activate'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  for (const check of [
    'provider_mapping_verified','phone_validation_configured','active_operator_available',
    'active_product_available','country_pricing_active','destination_fx_fresh',
    'localizations_complete','product_prices_valid',
  ]) assert.ok(route.includes(check), check);
  for (const language of ['en','ps','fa','ur','hi','bn']) assert.ok(route.includes(language), language);
});

test('country activation requires current-version successful preflight and disable removes it from runtime cache', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/activate'");
  const end = server.indexOf("app.post('/api/admin/countries/:countryCode/disable'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /configuration_version/);
  assert.match(route, /statusByName\.get\(name\) !== 'pass'/);
  assert.match(route, /status='active'/);
  const disableStart = end;
  const disableEnd = server.indexOf('// Customer APIs expose only active', disableStart);
  const disableRoute = server.slice(disableStart, disableEnd);
  assert.match(disableRoute, /DYNAMIC_COUNTRY_CONFIG\.delete\(code\)/);
});

test('customer catalog APIs only expose reviewed operators and products for active or legacy countries', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf('// Read-only wallet integrity diagnostics.', start);
  assert.ok(start >= 0 && end > start);
  const routes = server.slice(start, end);
  assert.match(routes, /status IN \('active','legacy'\)/);
  assert.match(routes, /active=TRUE/);
  assert.match(routes, /catalog_status='active'/);
  assert.match(routes, /verification_status='verified'/);
  assert.match(routes, /price_currency_verified=TRUE/);
});

test('Flutter loads country list, operators and denominations from backend endpoints', () => {
  assert.match(flutter, /api\/countries\/active/);
  assert.match(flutter, /api\/countries\/\$countryCode\/operators/);
  assert.match(flutter, /api\/countries\/\$countryCode\/products/);
  assert.match(flutter, /_availableCountries/);
  assert.match(flutter, /_loadedCountryOperators/);
  assert.match(flutter, /_loadedCountryAmounts/);
});
