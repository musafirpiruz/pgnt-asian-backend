'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migrate = fs.readFileSync(path.join(root, 'migrate.js'), 'utf8');
const migration022 = fs.readFileSync(path.join(root, 'migrations', '022_canonical_country_registry_reconciliation.sql'), 'utf8');
const migration023 = fs.readFileSync(path.join(root, 'migrations', '023_current_catalog_country_registry_bootstrap.sql'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const flutter = fs.readFileSync(path.join(root, 'main.dart'), 'utf8');

test('canonical country registry migrations run after legacy catalog foundation in safe order', () => {
  const ranged = migrate.indexOf('018_dtone_ranged_value_foundation');
  const canonical = migrate.indexOf('022_canonical_country_registry_reconciliation');
  const bootstrap = migrate.indexOf('023_current_catalog_country_registry_bootstrap');
  assert.ok(ranged >= 0 && canonical > ranged && bootstrap > canonical,
    '022 and 023 must run after 018 and in canonical-before-bootstrap order');
  assert.match(migrate, /canonicalCountryMigrations\\s*=\\s*\\[/);
  assert.match(migrate, /Required migration file is missing/);
});

test('022 creates one canonical country parent and fails closed on conflicting legacy identities', () => {
  for (const token of [
    'CREATE TABLE IF NOT EXISTS country_registry',
    'CREATE TABLE IF NOT EXISTS country_localizations',
    'CREATE TABLE IF NOT EXISTS country_operators',
    'Country registry reconciliation found',
    'Cannot reconcile:',
    'country_registry_reconciliation',
    'INSERT INTO schema_migrations',
  ]) assert.ok(migration022.includes(token), '022 missing safety contract: ' + token);
  assert.match(migration022, /RAISE EXCEPTION/);
});

test('023 seeds only four known countries and leaves all imported capabilities disabled', () => {
  for (const token of [
    "('AF','Afghanistan','AFN','+93',9,9)",
    "('PK','Pakistan','PKR','+92',10,10)",
    "('IN','India','INR','+91',10,10)",
    "('BD','Bangladesh','BDT','+880',10,10)",
    "'legacy'",
    'FALSE,NULL',
    'active_operators_before',
    'active_mappings_before',
    'active_products_before',
    'Bootstrap changed operator activation or verification state',
    'Bootstrap changed product catalog activation state',
  ]) assert.ok(migration023.includes(token), '023 missing fail-closed seed rule: ' + token);
  assert.match(migration023, /RAISE EXCEPTION/);
});

test('Flutter obtains operator options from the registry endpoint and server filters unverified mappings', () => {
  assert.match(flutter, /api\\/countries\\/\\$countryCode\\/operators/);
  assert.match(flutter, /operatorKey/);
  assert.match(server, /o\\.provider_operator_id IS NOT NULL/);
  assert.match(server, /o\\.verified_at IS NOT NULL/);
});
