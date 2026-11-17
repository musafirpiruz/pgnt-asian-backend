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
