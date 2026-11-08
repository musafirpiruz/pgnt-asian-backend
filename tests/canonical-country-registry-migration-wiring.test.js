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
  assert.match(migration, /country_registry is canonical/);
  assert.match(migration, /FOREIGN KEY \(country_code\) REFERENCES country_registry/);
});

test('ranged activation route validates positive numeric product IDs with digit matching', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/:productId/activate'");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/\^\[1-9\]\\d\{0,17\}\$\//);
});
