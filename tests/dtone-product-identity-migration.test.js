'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '022_dtone_product_identity.sql'),
  'utf8'
);
const runner = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('migration 022 adds catalog metadata and mapping provider identities', () => {
  for (const token of [
    'ADD COLUMN IF NOT EXISTS product_name',
    'ADD COLUMN IF NOT EXISTS product_type',
    'ADD COLUMN IF NOT EXISTS wholesale_fee_eur_cents',
    'ADD COLUMN IF NOT EXISTS provider_operator_id',
    'ADD COLUMN IF NOT EXISTS provider_product_id',
  ]) assert.ok(migration.includes(token), 'missing migration change: ' + token);
});

test('migration 022 removes amount uniqueness but retains product ID uniqueness', () => {
  assert.match(migration, /DROP CONSTRAINT %I/);
  assert.match(migration, /idx_product_catalog_country_operator_amount/);
  assert.doesNotMatch(migration, /DROP CONSTRAINT[^;]*product_id/i);
});

test('migration 022 is registered after 021 and imports or activates no catalog rows', () => {
  assert.match(runner, /022_dtone_product_identity/);
  assert.match(runner, /migrations", "022_dtone_product_identity\.sql/);
  assert.doesNotMatch(migration, /INSERT INTO product_catalog|UPDATE product_catalog|active\s*=\s*TRUE/i);
});
