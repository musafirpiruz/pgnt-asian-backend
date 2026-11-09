'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '020_canonical_country_registry.sql'),
  'utf8'
);

test('public country catalog is driven by active canonical registry rows', () => {
  const start = server.indexOf("app.get('/api/countries',");
  const end = server.indexOf("app.get('/api/countries/:countryCode/operators'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  for (const field of [
    'country_code', 'country_name', 'destination_currency', 'calling_code',
    'phone_min_digits', 'phone_max_digits', 'provider_country_code',
    'configuration_version',
  ]) assert.match(route, new RegExp(field));
  assert.match(route, /c\.status = 'active'/);
  assert.match(route, /c\.provider = 'dtone'/);
  assert.match(route, /country_localizations/);
  assert.match(route, /countryCode:/);
  assert.match(route, /providerCountryCode:/);
  assert.doesNotMatch(route, /AFG|PAK|IND|BGD|Afghanistan|Pakistan|India|Bangladesh/);
});

test('canonical registry contains the configuration fields needed for future destinations', () => {
  const tableStart = migration.indexOf('CREATE TABLE IF NOT EXISTS country_registry');
  const tableEnd = migration.indexOf('CREATE TABLE IF NOT EXISTS country_localizations', tableStart);
  assert.ok(tableStart >= 0 && tableEnd > tableStart);
  const schema = migration.slice(tableStart, tableEnd);
  for (const field of [
    'country_code', 'country_name', 'destination_currency', 'calling_code',
    'phone_min_digits', 'phone_max_digits', 'provider', 'provider_country_code',
    'configuration_version', 'status',
  ]) assert.match(schema, new RegExp(field));
  assert.match(schema, /'active'/);
  assert.match(schema, /'disabled'/);
});

test('ranged product discovery resolves any destination through canonical provider country data', () => {
  const start = server.indexOf("app.get('/api/ranged-products'");
  const end = server.indexOf("\napp.", start + 10);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);

  // Country selection is an ISO-2 registry key. Provider ISO-3 identity
  // must be looked up from registry data, never a four-country code map.
  assert.match(route, /getActiveCountryConfig\(country\)/);
  assert.match(route, /JOIN country_registry c/);
  assert.match(route, /c\.provider = 'dtone'/);
  assert.match(route, /c\.provider_country_code/);
  assert.match(route, /c\.country_code = \$1/);
  assert.match(route, /providerCountry\s*!==\s*String\(row\.country_iso_code\)/);
  assert.doesNotMatch(route, /RANGED_COUNTRY_ISO3|WHEN\s+'AFG'|WHEN\s+'PAK'|WHEN\s+'IND'|WHEN\s+'BGD'/);
});

test('customer operator discovery exposes only verified canonical provider mappings', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf("\napp.", start + 10);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /FROM country_registry c/);
  assert.match(route, /JOIN country_operators o/);
  assert.match(route, /o\.provider_operator_id IS NOT NULL/);
  assert.match(route, /o\.verified_at IS NOT NULL/);
  assert.match(route, /country_operator_products/);
  assert.match(route, /cop\.verified_at IS NOT NULL/);
  assert.match(route, /operator_key:/);
  assert.match(route, /provider_operator_id:/);
  assert.match(route, /display_name:/);
});

test('legacy country rows remain admin-discoverable but never customer-active by default', () => {
  const configuredStart = server.indexOf('async function getConfiguredDtOneCountryByIso');
  const configuredEnd = server.indexOf('function normalizeRegistryPhone', configuredStart);
  assert.ok(configuredStart >= 0 && configuredEnd > configuredStart);
  const configuredLookup = server.slice(configuredStart, configuredEnd);
  assert.match(configuredLookup, /'legacy'/);

  const adminStart = server.indexOf("app.get('/api/admin/dtone/countries'");
  const adminEnd = server.indexOf("\napp.", adminStart + 10);
  assert.ok(adminStart >= 0 && adminEnd > adminStart);
  assert.match(server.slice(adminStart, adminEnd), /'legacy'/);

  const publicStart = server.indexOf("app.get('/api/countries',");
  const publicEnd = server.indexOf("app.get('/api/countries/:countryCode/operators'", publicStart);
  const publicRoute = server.slice(publicStart, publicEnd);
  assert.match(publicRoute, /c\.status = 'active'/);
  assert.doesNotMatch(publicRoute, /'legacy'/);
});

test('confirmed DT One catalog import prepares verified operator mappings without activation', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country'");
  const end = server.indexOf("app.get('/api/admin/dtone/countries'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /providerOperatorId/);
  assert.match(route, /operatorKey/);
  assert.match(route, /INSERT INTO country_operators/);
  assert.match(route, /provider_operator_id/);
  assert.match(route, /verified_at/);
  assert.match(route, /INSERT INTO country_operator_products/);
  assert.match(route, /productsRemainDisabled: true/);
  assert.match(route, /operatorsRemainDisabled: true/);
  assert.match(route, /productMappingsRemainDisabled: true/);
});
