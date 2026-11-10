'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrate = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '020_canonical_country_registry.sql'), 'utf8');

test('migration 020 is wired into the production migration runner exactly once', () => {
  assert.match(migrate, /020_canonical_country_registry/);
  assert.match(migrate, /path\.join\(__dirname, "migrations", "020_canonical_country_registry\.sql"\)/);
  assert.match(migrate, /await client\.query\(reconciliationSql\)/);
  assert.match(migrate, /INSERT INTO schema_migrations \(version\) VALUES \(\$1\)/);
});

test('production registry migration is transaction-neutral and conflict-sensitive', () => {
  assert.doesNotMatch(migration, /^BEGIN;\s*$/m);
  assert.doesNotMatch(migration, /^COMMIT;\s*$/m);
  assert.match(migration, /conflicting country rows/);
  assert.match(migration, /operator localization rows have no matching stable operator/);
  assert.match(migration, /country_registry_reconciliation/);
  assert.ok(migration.includes('replace(child_record.definition,'));
  assert.ok(migration.includes('REFERENCES country_registry(country_code)'));
});

test('ranged activation route validates positive numeric product IDs with digit matching', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/:productId/activate'");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/\^\[1-9\]\\d\{0,17\}\$\//);
});



test('ranged quote idempotency migration is wired after the ranged transaction table exists', () => {
  const idempotencyMigration = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '021_ranged_quote_idempotency.sql'),
    'utf8'
  );
  assert.match(migrate, /021_ranged_quote_idempotency/);
  assert.match(migrate, /path\.join\(__dirname, "migrations", "021_ranged_quote_idempotency\.sql"\)/);
  assert.match(idempotencyMigration, /request_key_hash CHAR\(64\)/);
  assert.match(idempotencyMigration, /CREATE UNIQUE INDEX/);
  assert.match(idempotencyMigration, /WHERE request_key_hash IS NOT NULL/);
});

test('country registry migration preserves existing FK definitions rather than forcing cascade', () => {
  assert.match(migration, /pg_get_constraintdef\(fk\.oid\)/);
  assert.match(migration, /child_record\.definition/);
  assert.match(migration, /child_record\.is_valid/);
  assert.doesNotMatch(migration, /REFERENCES country_registry\(country_code\) ON DELETE CASCADE',/);
});

test('fresh installs reconcile operator-product mappings after canonical registry migration 020', () => {
  const registry = migrate.indexOf('const canonicalCountryRegistryVersion = "020_canonical_country_registry"');
  const postRegistryMapping = migrate.indexOf('Post-registry mapping reconciliation completed');
  const idempotency = migrate.indexOf('const rangedQuoteIdempotencyVersion = "021_ranged_quote_idempotency"');
  assert.ok(registry >= 0 && postRegistryMapping > registry && idempotency > postRegistryMapping);
  const block = migrate.slice(postRegistryMapping - 2600, idempotency);
  assert.match(block, /CREATE TABLE IF NOT EXISTS country_operator_products/);
  assert.match(block, /REFERENCES country_operators\(country_code, operator_key\)/);
  assert.match(block, /REFERENCES product_catalog\(id\)/);
  assert.match(block, /active BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(block, /verified_at TIMESTAMPTZ/);
  assert.match(block, /INSERT INTO schema_migrations/);
  assert.match(block, /missing columns/);
});
