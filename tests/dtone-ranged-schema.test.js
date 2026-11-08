'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('DT One ranged-value migration is versioned and idempotent', () => {
  assert.match(migration, /018_dtone_ranged_value_foundation/);
  assert.match(migration, /SELECT version FROM schema_migrations WHERE version = \$1 LIMIT 1/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS dtone_product_capabilities/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS dtone_ranged_transactions/);
});

test('ranged product capabilities preserve provider range and calculation-mode constraints', () => {
  const start = migration.indexOf('CREATE TABLE IF NOT EXISTS dtone_product_capabilities');
  const end = migration.indexOf('CREATE INDEX IF NOT EXISTS idx_dtone_product_capabilities_inactive', start);
  assert.ok(start >= 0 && end > start);
  const sql = migration.slice(start, end);
  assert.match(sql, /RANGED_VALUE_RECHARGE/);
  assert.match(sql, /min_amount IS NOT NULL AND max_amount IS NOT NULL/);
  assert.match(sql, /amount_increment IS NOT NULL AND min_amount > 0/);
  assert.match(sql, /max_amount >= min_amount AND amount_increment > 0/);
  assert.match(sql, /amount_increment > 0/);
  assert.match(sql, /accepted_calculation_modes JSONB/);
  assert.match(sql, /capability_verified_at TIMESTAMPTZ/);
  assert.match(sql, /CHECK \(active = FALSE OR capability_verified_at IS NOT NULL\)/);
});

test('ranged transaction ledger stores one provider transaction per order and confirmation deadline', () => {
  const start = migration.indexOf('CREATE TABLE IF NOT EXISTS dtone_ranged_transactions');
  const end = migration.indexOf('CREATE INDEX IF NOT EXISTS idx_dtone_ranged_transactions_status_deadline', start);
  assert.ok(start >= 0 && end > start);
  const sql = migration.slice(start, end);
  assert.match(sql, /order_id VARCHAR\(80\) NOT NULL UNIQUE/);
  assert.match(sql, /dtone_transaction_id VARCHAR\(255\) UNIQUE/);
  assert.match(sql, /external_id VARCHAR\(100\) NOT NULL UNIQUE/);
  assert.match(sql, /requested_amount NUMERIC/);
  assert.match(sql, /wholesale_amount NUMERIC/);
  assert.match(sql, /wholesale_currency CHAR\(3\)/);
  assert.match(sql, /confirm_by TIMESTAMPTZ/);
  assert.match(sql, /price_evidence JSONB/);
  assert.match(sql, /provider_status <> 'CONFIRMED' OR confirmed_at IS NOT NULL/);
});

test('ranged-value foundation does not seed, activate, or submit provider transactions', () => {
  const start = migration.indexOf('// Version 018 lays down an isolated, fail-closed data model');
  const end = migration.indexOf('018_dtone_ranged_value_foundation is already applied.', start);
  assert.ok(start >= 0 && end > start);
  const section = migration.slice(start, end);
  assert.doesNotMatch(section, /INSERT INTO product_catalog/i);
  assert.doesNotMatch(section, /UPDATE product_catalog\s+SET\s+active\s*=\s*TRUE/i);
  assert.doesNotMatch(section, /\/v1\/transactions/i);
  assert.match(section, /active BOOLEAN NOT NULL DEFAULT FALSE/);
});
