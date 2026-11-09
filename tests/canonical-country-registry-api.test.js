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
