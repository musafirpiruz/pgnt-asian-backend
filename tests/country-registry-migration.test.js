'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationSource = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('country registry migration 017 creates normalized configuration tables', () => {
  const start = migrationSource.indexOf('const countryRegistryVersion = "017_database_country_registry"');
  const end = migrationSource.indexOf('} catch (error)', start);
  assert.ok(start >= 0 && end > start, 'version 017 migration exists');
  const migration = migrationSource.slice(start, end);
  for (const table of [
    'countries',
    'country_localizations',
    'country_operators',
    'operator_prefixes',
    'country_exchange_rates',
    'country_provider_settings',
  ]) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  }
});

test('country registry seeds current destinations as active and DT One mapped', () => {
  const start = migrationSource.indexOf('const countryRegistryVersion = "017_database_country_registry"');
  const end = migrationSource.indexOf('} catch (error)', start);
  const migration = migrationSource.slice(start, end);
  for (const row of [
    "('AF','Afghanistan','AFN','+93',9,9,'DTONE','active')",
    "('PK','Pakistan','PKR','+92',10,10,'DTONE','active')",
    "('IN','India','INR','+91',10,10,'DTONE','active')",
    "('BD','Bangladesh','BDT','+880',10,10,'DTONE','active')",
  ]) assert.ok(migration.includes(row), 'existing country seed is preserved: ' + row);
  assert.match(migration, /ON CONFLICT \(code\) DO NOTHING/);
  assert.match(migration, /ON CONFLICT \(country_code, provider_code\) DO NOTHING/);
});

test('country registry migration is additive and does not rewrite money or fulfillment records', () => {
  const start = migrationSource.indexOf('const countryRegistryVersion = "017_database_country_registry"');
  const end = migrationSource.indexOf('} catch (error)', start);
  const migration = migrationSource.slice(start, end);
  assert.doesNotMatch(migration, /\b(UPDATE|DELETE)\s+(pricing_settings|product_catalog|orders|refunds|wallet_ledger)\b/i);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'draft'/);
  assert.match(migration, /'draft','testing','active','disabled'/);
  assert.match(migration, /is_reference_only BOOLEAN NOT NULL DEFAULT TRUE/);
});
