'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'dtone-master-workbook-reconciliation-routes.js'),
  'utf8'
);

test('all reconciliation endpoints require the existing admin authentication middleware', () => {
  assert.match(source, /requireAdmin/);
  assert.match(source, /\/api\/admin\/dtone\/master-reconciliation\/runs/);
});

test('workbook upload requires an explicit read-only confirmation and strict XLSX parser', () => {
  assert.match(source, /express\.raw\(\{ type: XLSX_MIME, limit: '2mb' \}\)/);
  assert.match(source, /x-read-only-confirmation/);
  assert.match(source, /parseOfficialMasterWorkbook/);
});

test('refuses the implicit pre-production fallback and records the explicit DT One API origin', () => {
  assert.match(source, /dtoneApiBaseUrlExplicit/);
  assert.match(source, /default pre-production fallback is not accepted/);
  assert.match(source, /api_origin/);
});

test('uses explicit DT One ISO alpha-3 mappings for all four workbook countries', () => {
  assert.match(source, /AFG: 'AF'/);
  assert.match(source, /PAK: 'PK'/);
  assert.match(source, /IND: 'IN'/);
  assert.match(source, /BGD: 'BD'/);
  assert.match(source, /DTONE_COUNTRY_CODE_MAP/);
});

test('provider verification uses GET product-detail requests with a global rate lock', () => {
  assert.match(source, /pg_try_advisory_lock/);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /await delay\(1000\)/);
  assert.match(source, /\/v1\/products\//);
});

test('reconciliation route has no product import, activation, payment, or transaction path', () => {
  assert.doesNotMatch(source, /product_catalog|\/v1\/transactions|stripe/i);
  assert.match(source, /safe_to_import: false/);
  assert.match(source, /products_activated: false/);
  assert.match(source, /payments_created: false/);
  assert.match(source, /topups_created: false/);
});

test('rate-limit and provider errors pause the run rather than retrying automatically', () => {
  assert.match(source, /response\.status === 429/);
  assert.match(source, /status = 'paused'/);
  assert.match(source, /automaticRetry: false/);
});

test('registers reconciliation staging as migration 037 after independently versioned pricing migrations', () => {
  const runner = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  assert.match(runner, /version: "037_dtone_master_reconciliation_staging"/);
  assert.match(runner, /037_dtone_master_reconciliation_staging\\.sql/);
  assert.match(runner, /Keep reconciliation staging after the optional 032-036 pricing\/audit/);
});
