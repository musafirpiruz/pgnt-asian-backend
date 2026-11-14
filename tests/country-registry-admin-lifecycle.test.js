'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '030_country_registry_audit_trail.sql'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'migrate.js'), 'utf8');

test('country registry audit migration is registered and stores versioned before/after snapshots', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS country_registry_audit/);
  assert.match(migration, /REFERENCES country_registry\(country_code\) ON DELETE RESTRICT/);
  assert.match(migration, /previous_version INTEGER NOT NULL/);
  assert.match(migration, /new_version INTEGER NOT NULL/);
  assert.match(migration, /old_values JSONB NOT NULL/);
  assert.match(migration, /new_values JSONB NOT NULL/);
  assert.match(migration, /country_registry_audit_country_created_idx/);
  assert.match(runner, /030_country_registry_audit_trail/);
  assert.match(runner, /030_country_registry_audit_trail\.sql/);
});

test('country configuration endpoint uses optimistic locking and records audit atomically', () => {
  const start = server.indexOf("app.put('/api/admin/countries/:countryCode/configuration'");
  const end = server.indexOf("app.get('/api/admin/countries/:countryCode/audit'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /expectedConfigurationVersion/);
  assert.match(route, /FOR UPDATE/);
  assert.match(route, /configuration_version=configuration_version\+1/);
  assert.match(route, /INSERT INTO country_registry_audit/);
  assert.match(route, /BEGIN/);
  assert.match(route, /COMMIT/);
  assert.match(route, /ROLLBACK/);
  assert.match(route, /countryActivated: false/);
});

test('country configuration lifecycle cannot activate countries or bypass sandbox review', () => {
  const start = server.indexOf("app.put('/api/admin/countries/:countryCode/configuration'");
  const end = server.indexOf("app.get('/api/admin/countries/:countryCode/audit'", start);
  const route = server.slice(start, end);
  assert.match(route, /new Set\(\['draft','configuring','testing','disabled','legacy'\]\)/);
  assert.match(route, /Active country configuration is immutable/);
  assert.match(route, /Activation requires the separate reviewed process/);
  assert.match(route, /provider country code is already assigned/);
  assert.doesNotMatch(route, /status\s*=\s*'active'/);
});

test('country audit history is read-only, bounded and country-scoped', () => {
  const start = server.indexOf("app.get('/api/admin/countries/:countryCode/audit'");
  const end = server.indexOf('// Record administrator-reviewed sandbox evidence.', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /ORDER BY id DESC LIMIT \$2/);
  assert.match(route, /Math\.min\(100,requestedLimit\)/);
  assert.match(route, /WHERE country_code=\$1/);
  assert.match(route, /Cache-Control','no-store/);
});


test('customer pricing quote requires a fresh active country registry and matching destination currency', () => {
  const start = server.indexOf("app.get('/api/pricing/quote'");
  const end = server.indexOf("app.post('/api/payments/checkout'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /countryRegistryRuntime\.getFreshSnapshot\(\)/);
  assert.match(route, /snapshot\.countries\[country\]/);
  assert.match(route, /Country is not active/);
  assert.match(route, /product\.currency !== countryConfig\.currency/);
  assert.doesNotMatch(route, /isValidCountry\(country\)/);
});
