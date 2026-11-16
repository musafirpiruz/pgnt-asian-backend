'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migration 036 sets the owner-approved EUR 0.49 fee for all four countries only', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '036_four_country_app_fee_eur_049.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const runner = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

  assert.match(sql, /SET fee_eur_cents = 49/);
  assert.match(sql, /WHERE country IN \('AF', 'PK', 'IN', 'BD'\)/);
  assert.match(sql, /updated_count <> 4/);
  assert.match(sql, /036_four_country_app_fee_eur_049/);
  assert.doesNotMatch(sql, /UPDATE\s+orders|UPDATE\s+product_catalog|UPDATE\s+country_fx_rates/i);
  assert.match(runner, /036_four_country_app_fee_eur_049\.sql/);
});

test('migration 036 does not estimate or rewrite historical order amounts or statuses', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '036_four_country_app_fee_eur_049.sql'),
    'utf8'
  );
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+orders|UPDATE\s+orders|DELETE\s+FROM\s+orders/i);
  assert.doesNotMatch(sql, /estimated|estimate|approximate/i);
});
