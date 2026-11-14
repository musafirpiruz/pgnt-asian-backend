'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '023_current_catalog_country_registry_bootstrap.sql'),
  'utf8'
);

test('country registry migration defines a constrained lifecycle and defaults new countries to legacy', () => {
  assert.match(migration, /status VARCHAR\(20\) NOT NULL DEFAULT 'legacy'/i);
  assert.match(migration, /'draft','configuring','testing','active','disabled','legacy'/i);
  assert.match(migration, /configuration_version INTEGER NOT NULL DEFAULT 1/i);
});

test('operator and product mappings default inactive and unverified', () => {
  assert.match(migration, /active BOOLEAN NOT NULL DEFAULT FALSE, verified_at TIMESTAMPTZ/i);
  assert.match(migration, /provider_operator_id,active,verified_at\)[\s\S]*?NULL,FALSE,NULL/i);
  assert.match(migration, /product_catalog_id,active,verified_at\)[\s\S]*?FALSE,NULL/i);
  assert.match(migration, /Bootstrap changed operator activation or verification state/i);
  assert.match(migration, /Bootstrap changed product-mapping activation or verification state/i);
});

test('migration never promotes a country, operator or product to active', () => {
  assert.doesNotMatch(migration, /SET status\s*=\s*'active'/i);
  assert.doesNotMatch(migration, /SET active\s*=\s*TRUE/i);
  assert.match(migration, /VALUES\(expected\.country_code[\s\S]*?'legacy'\)/i);
});
