'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const adminPanel = fs.readFileSync(path.join(__dirname, '..', 'admin-panel.html'), 'utf8');
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
  assert.doesNotMatch(route, /INSERT INTO|UPDATE\s+country_|fetch\(/i);
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
  assert.doesNotMatch(route, /SET\s+(?:active|operator_active|mapping_active)\s*=\s*TRUE/i);
});

test('approval audit schema restricts actors, outcomes, and one active sample per operator', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_country_operator_current_sample_approval/);
  assert.match(migration, /WHERE status = 'approved'/);
  assert.match(migration, /'admin_user','admin_api_key','system'/);
  assert.match(migration, /'success','rejected','preview'/);
});

test('operator overview endpoint is authenticated and reports read-only verification counts', () => {
  const route = routeBetween(
    "app.get('/api/admin/country-operators',",
    "app.get('/api/admin/country-operators/:operatorId/catalog-candidates'"
  );
  assert.match(route, /requireAdmin/);
  assert.match(route, /COUNT\(DISTINCT p\.id\)/);
  assert.match(route, /country_operator_approvals/);
  assert.match(route, /catalog_verification_audit/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE\s+(?:country_|product_)/i);
});

test('admin panel exposes one-sample approval and bounded automatic verification controls', () => {
  for (const token of [
    'id="loadOperatorCatalog"',
    'id="operatorCatalog"',
    '/api/admin/country-operators',
    '/catalog-candidates',
    '/approve-sample',
    'confirmApproval:true',
    '/catalog-auto-verify',
    '/catalog-retry-reviewed',
    'limit:25',
    'result.verifiedCount',
    'result.reviewCount',
    'activationChanged',
  ]) assert.ok(adminPanel.includes(token), 'missing admin panel workflow element: ' + token);
  assert.match(adminPanel, /if\(!confirm\(/);
  assert.match(adminPanel, /products not activated|محصول یا شبکه فعاله نه شوه/);
});

test('admin panel inline JavaScript parses successfully', () => {
  const start = adminPanel.indexOf('<script>');
  const end = adminPanel.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, 'expected one inline admin panel script');
  assert.equal(adminPanel.indexOf('<script>', start + 1), -1, 'unexpected second inline script');
  assert.doesNotThrow(() => new vm.Script(adminPanel.slice(start + 8, end)));
});


test('durable catalog cursor and explicit reviewed-product retry are server-side', () => {
  assert.match(server, /country_operator_catalog_verification_progress/);
  assert.match(server, /requestedAfterProductCatalogId!==afterProductCatalogId/);
  assert.match(server, /catalog-retry-reviewed/);
  assert.match(server, /confirmRetry!==true/);
  assert.match(server, /verificationStarted:false/);
  assert.match(migration, /country_operator_catalog_progress/);
  assert.match(migration, /last_processed_product_catalog_id/);
});


test('automatic verification serializes concurrent pages against the durable cursor', () => {
  assert.match(server, /SELECT last_processed_product_catalog_id FROM country_operator_catalog_verification_progress WHERE operator_id=\$1 AND approval_id=\$2 FOR UPDATE/);
  assert.match(server, /persistedCursor!==afterProductCatalogId/);
  assert.match(server, /v\.evidence->>'approvalId'=a\.id::text/);
});
