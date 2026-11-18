'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '024_country_provider_approval_audit.sql'),
  'utf8'
);

function routeBetween(startMarker, endMarker) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'expected admin route source markers');
  return server.slice(start, end);
}

test('admin catalog candidate route is authenticated and read-only', () => {
  const route = routeBetween(
    "app.get('/api/admin/country-operators/:operatorId/catalog-candidates'",
    "app.post('/api/admin/country-operators/:operatorId/approve-sample'"
  );
  assert.match(route, /requireAdmin/);
  assert.match(route, /FROM country_operators/);
  assert.match(route, /LEFT JOIN country_operator_products/);
  assert.match(route, /LEFT JOIN product_catalog/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE\\s+country_|fetch\\(/i);
});

test('sample approval requires explicit confirmation and authoritative DT One detail', () => {
  const route = routeBetween(
    "app.post('/api/admin/country-operators/:operatorId/approve-sample'",
    '// Small browser page for the owner'
  );
  for (const token of [
    'requireAdmin',
    'confirmApproval!==true',
    'await pool.connect()',
    'BEGIN',
    '/v1/products/',
    'evaluateDtOneCatalogMatch({...row,active:row.product_active},providerProduct)',
    'country_operator_approvals',
    'catalog_verification_audit',
    'COMMIT',
    'ROLLBACK',
    'if(client) client.release()',
  ]) assert.ok(route.includes(token), 'missing approval safety contract: ' + token);
  assert.match(route, /operator_active\|\|row\.product_active\|\|row\.mapping_active/);
  assert.match(route, /operatorActive:false,productMappingActive:false,productActive:false/);
  assert.match(route, /transactionCreated:false/);
  assert.doesNotMatch(route, /SET\\s+(?:active|operator_active|mapping_active)\\s*=\\s*TRUE/i);
});

test('approval audit schema restricts actors, outcomes, and one active sample per operator', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_country_operator_current_sample_approval/);
  assert.match(migration, /WHERE status = 'approved'/);
  assert.match(migration, /'admin_user','admin_api_key','system'/);
  assert.match(migration, /'success','rejected','preview'/);
});
