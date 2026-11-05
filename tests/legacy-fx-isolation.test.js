'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('legacy four-country pricing continues to read its existing manual FX settings', () => {
  const start = server.indexOf('async function getPricingSettings');
  const end = server.indexOf('// Read an enabled product from the database.', start);
  assert.ok(start >= 0 && end > start);
  const resolver = server.slice(start, end);
  assert.match(resolver, /FROM pricing_settings WHERE country = \$1/);
  assert.match(resolver, /COALESCE\(local_currency_per_eur, afn_per_eur\)/);
  assert.match(resolver, /FROM country_pricing_settings WHERE country_code=\$1/);
  assert.match(resolver, /FROM fx_currency_rates/);
  assert.ok(resolver.indexOf('FROM pricing_settings') < resolver.indexOf('FROM country_pricing_settings'));
});

test('automatic registry FX refresh writes only the separate FX rate ledger, not legacy pricing rows', () => {
  const start = server.indexOf('async function refreshFxCurrencyRate');
  const end = server.indexOf('// Discover and import a registry country catalog.', start);
  assert.ok(start >= 0 && end > start);
  const refresh = server.slice(start, end);
  assert.match(refresh, /INSERT INTO fx_currency_rate_history/);
  assert.match(refresh, /INSERT INTO fx_currency_rates/);
  assert.doesNotMatch(refresh, /UPDATE\s+pricing_settings|UPDATE\s+country_pricing_settings/i);
  assert.match(refresh, /previous saved rate preserved/);
});

test('legacy local currency migration preserves existing manual AFN rates when adding the generic rate column', () => {
  const start = migration.indexOf('const localCurrencyRateVersion = "012_country_local_currency_rates"');
  const end = migration.indexOf('const refundUniquenessVersion', start);
  assert.ok(start >= 0 && end > start);
  const localRateMigration = migration.slice(start, end);
  assert.match(localRateMigration, /SET local_currency_per_eur = afn_per_eur/);
  assert.match(localRateMigration, /WHERE local_currency_per_eur IS NULL/);
  assert.doesNotMatch(localRateMigration, /SET afn_per_eur\s*=/);
});

test('the integrated review branch has one unique schema migration key per declared migration', () => {
  const versions = [...migration.matchAll(/const\s+\w+Version\s*=\s*["'](\d{3}_[a-z0-9_-]+)["']/g)]
    .map((match) => match[1]);
  assert.ok(versions.length > 0, 'migration version declarations must be discoverable');
  assert.equal(new Set(versions).size, versions.length, 'duplicate schema_migrations keys would make rollout ambiguous');
});
