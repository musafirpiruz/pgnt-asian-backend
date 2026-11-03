'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationSource = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

function getMigration() {
  const start = migrationSource.indexOf('const countryRegistryVersion = "017_dynamic_country_registry"');
  const end = migrationSource.indexOf('} catch (error)', start);
  assert.ok(start >= 0 && end > start, 'version 017 country registry migration exists');
  return migrationSource.slice(start, end);
}

test('dynamic country registry migration is idempotent and additive', () => {
  const migration = getMigration();
  for (const table of [
    'country_registry',
    'country_localizations',
    'country_provider_mappings',
    'country_operators',
    'country_operator_prefixes',
    'country_products',
    'country_fx_rates',
    'country_sync_runs',
    'country_activation_checks',
    'country_configuration_audit',
  ]) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  }
  assert.match(migration, /SELECT version FROM schema_migrations/);
  assert.match(migration, /ON CONFLICT \(country_code\) DO NOTHING/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+(pricing_settings|product_catalog|orders)/i);
  assert.doesNotMatch(migration, /UPDATE\s+(pricing_settings|product_catalog|orders)/i);
});

test('new countries default to draft and legacy four-country settings are preserved', () => {
  const migration = getMigration();
  assert.match(migration, /status VARCHAR\(20\) NOT NULL DEFAULT 'draft'/);
  assert.match(migration, /'AF','Afghanistan','AFN','\+93',9,9,'dtone','AFG','legacy'/);
  assert.match(migration, /'PK','Pakistan','PKR','\+92',10,10,'dtone','PAK','legacy'/);
  assert.match(migration, /'IN','India','INR','\+91',10,10,'dtone','IND','legacy'/);
  assert.match(migration, /'BD','Bangladesh','BDT','\+880',10,10,'dtone','BGD','legacy'/);
  assert.match(migration, /ON CONFLICT \(country_code\) DO NOTHING/);
  assert.match(migration, /status VARCHAR\(20\) NOT NULL DEFAULT 'draft'/);
});

test('catalog activation is blocked unless provider price currency and EUR cost are verified', () => {
  const migration = getMigration();
  assert.match(migration, /wholesale_currency CHAR\(3\)/);
  assert.match(migration, /price_currency_verified BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /verification_status = 'verified'/);
  assert.match(migration, /price_currency_verified = TRUE/);
  assert.match(migration, /wholesale_eur_cents > 0/);
  assert.match(migration, /catalog_status <> 'active'/);
});

test('FX observations include source and freshness window and are not auto-approved', () => {
  const migration = getMigration();
  assert.match(migration, /source VARCHAR\(80\) NOT NULL/);
  assert.match(migration, /observed_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /is_approved BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /CHECK \(expires_at > observed_at\)/);
});
