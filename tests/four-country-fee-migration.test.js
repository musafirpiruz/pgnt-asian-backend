'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migration 036 creates the audit foundation but does not change live fees before Admin approval', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '036_four_country_app_fee_eur_049.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const runner = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS country_pricing_fee_audit/);
  assert.match(sql, /previous_fee_eur_cents/);
  assert.match(sql, /new_fee_eur_cents/);
  assert.match(sql, /changed_by/);
  assert.match(sql, /036_four_country_app_fee_eur_049/);
  assert.doesNotMatch(sql, /UPDATE\s+pricing_settings|UPDATE\s+orders|UPDATE\s+product_catalog|UPDATE\s+country_fx_rates/i);
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


test('Admin approval updates only the four app fees and records the admin actor', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-panel.html'), 'utf8');
  const start = server.indexOf("app.post('/api/admin/pricing/fee/approve-four-countries'");
  const end = server.indexOf('// Update country pricing controls', start);
  assert.ok(start >= 0 && end > start, 'Admin fee approval route must exist');
  const route = server.slice(start, end);
  assert.match(route, /requireAdmin/);
  assert.match(route, /confirmApproval !== true/);
  assert.match(route, /Number\(req\.body\?\.feeEurCents\) !== 49/);
  assert.match(route, /UPDATE pricing_settings[\s\S]*fee_eur_cents = 49/);
  assert.match(route, /INSERT INTO country_pricing_fee_audit/);
  assert.match(route, /req\.adminActorId/);
  assert.match(route, /ordersChanged: false/);
  assert.match(route, /fxRatesChanged: false/);
  assert.match(route, /productsActivated: false/);
  assert.match(admin, /approveFourCountryFee/);
  assert.match(admin, /fee\/approve-four-countries/);
});
