'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migrate = fs.readFileSync(path.join(root, 'migrate.js'), 'utf8');
const migration026 = fs.readFileSync(path.join(root, 'migrations', '026_product_provider_metadata_foundation.sql'), 'utf8');
const migration027 = fs.readFileSync(path.join(root, 'migrations', '027_product_identity_uniqueness.sql'), 'utf8');
const classifier = fs.readFileSync(path.join(root, 'catalog-natural-key.js'), 'utf8');

test('all historical product catalog seed upserts target unique DT One product identity', () => {
  const seedUpserts = migrate.match(/ON CONFLICT \(country, operator, amount, currency\)/g) || [];
  assert.equal(seedUpserts.length, 0, 'legacy natural-key seed conflict target must be retired');
  const productIdUpserts = migrate.match(/ON CONFLICT \(product_id\)/g) || [];
  assert.equal(productIdUpserts.length, 3, 'expected all three historical catalog seed upserts to use provider identity');
});

test('provider metadata migration adds service and product type evidence without activation', () => {
  for (const field of [
    'provider_product_name', 'provider_service_name', 'provider_subservice_name',
    'provider_product_type', 'provider_details', 'provider_details_retrieved_at',
    'provider_details_source',
  ]) assert.ok(migration026.includes(field), 'missing metadata field: ' + field);
  assert.match(migration026, /BEGIN;/);
  assert.match(migration026, /COMMIT;/);
  assert.doesNotMatch(migration026, /UPDATE product_catalog\s+SET active\s*=\s*TRUE/i);
});

test('identity migration preserves provider product uniqueness and replaces legacy unique key with browse index', () => {
  assert.match(migration027, /product_catalog\.product_id must remain unique/);
  assert.match(migration027, /DROP CONSTRAINT/);
  assert.match(migration027, /idx_product_catalog_country_operator_amount_currency/);
  assert.doesNotMatch(migration027, /DROP COLUMN|DELETE FROM product_catalog|UPDATE product_catalog\s+SET active\s*=\s*TRUE/i);
});

test('catalog import classifies duplicates by provider product ID, not denomination', () => {
  assert.match(classifier, /existingIds/);
  assert.match(classifier, /counts\.get\(id\) > 1/);
  assert.doesNotMatch(classifier, /candidateGroups|existingByKey|Same operator and denomination/);
});
