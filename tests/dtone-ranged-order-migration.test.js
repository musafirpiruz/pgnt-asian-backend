'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'migrations', '028_order_fulfillment_type_ranged_identity.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const migrateEntrypoint = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('ranged order identity migration is explicitly review-only and not auto-applied', () => {
  assert.match(migration, /REVIEW ONLY/i);
  assert.match(migration, /do not wire into startup or apply/i);
  assert.doesNotMatch(migrateEntrypoint, /028_order_fulfillment_type_ranged_identity/i);
});

test('existing orders default to FIXED and keep the fixed catalog identity', () => {
  assert.match(migration, /fulfillment_type VARCHAR\(20\) NOT NULL DEFAULT 'FIXED'/i);
  assert.match(migration, /fulfillment_type = 'FIXED'[\s\S]*product_id IS NOT NULL[\s\S]*ranged_product_id IS NULL/i);
});

test('RANGED orders require a ranged product identity and cannot reuse fixed product_id', () => {
  assert.match(migration, /fulfillment_type = 'RANGED'[\s\S]*product_id IS NULL[\s\S]*ranged_product_id IS NOT NULL/i);
  assert.match(migration, /ranged_product_id BIGINT/i);
});

test('ranged product identity is constrained to the DT One ranged catalog', () => {
  assert.match(migration, /FOREIGN KEY \(ranged_product_id\)[\s\S]*REFERENCES dtone_ranged_products\(dtone_product_id\)/i);
  assert.match(migration, /ON DELETE RESTRICT/i);
});

test('migration constrains fulfillment type and indexes fulfillment status lookups', () => {
  assert.match(migration, /CHECK \(fulfillment_type IN \('FIXED', 'RANGED'\)\)/i);
  assert.match(migration, /idx_orders_fulfillment_type_status[\s\S]*\(fulfillment_type, status, created_at DESC\)/i);
});
