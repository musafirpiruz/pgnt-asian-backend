'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const { registerDtOneMasterWorkbookRoutes } = require('../dtone-master-workbook-reconciliation-routes');

const SOURCE_NAME = 'PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES-1.xlsx';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BASE_URL = 'https://preprod-dvs-api.dtone.com';
const COUNTRIES = [
  ...Array(542).fill('Afghanistan'),
  ...Array(783).fill('Pakistan'),
  ...Array(147).fill('India'),
  ...Array(488).fill('Bangladesh'),
];

async function makeWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('All_Products');
  sheet.addRow([
    'PRODUCT ID', 'PRODUCT NAME', 'OPERATOR COUNTRY', 'OPERATOR NAME',
    'SERVICE', 'SUBSERVICE', 'PRODUCT TYPE', 'DESTINATION CURRENCY',
    'DESTINATION AMOUNT', 'WHOLESALE PRICE (EUR)', 'RETAIL PRICE (EUR)',
  ]);
  for (let index = 0; index < 1960; index += 1) {
    const country = COUNTRIES[index];
    let service = 'Mobile';
    let subservice = 'Airtime';
    let type = 'FIXED_VALUE_RECHARGE';
    let currency = { Afghanistan: 'AFN', Pakistan: 'PKR', India: 'INR', Bangladesh: 'BDT' }[country];
    let localIndex;

    if (country === 'Afghanistan') {
      localIndex = index;
      if (localIndex >= 496 && localIndex < 516) subservice = 'Bundle';
      else if (localIndex >= 516) subservice = 'Data';
      if (localIndex >= 537) type = 'RANGED_VALUE_RECHARGE';
    } else if (country === 'Pakistan') {
      localIndex = index - 542;
      if (localIndex >= 598 && localIndex < 716) subservice = 'Bundle';
      else if (localIndex >= 716 && localIndex < 779) subservice = 'Data';
      if (localIndex >= 594 && localIndex < 598) type = 'RANGED_VALUE_RECHARGE';
      if (localIndex >= 776 && localIndex < 779) type = 'RANGED_VALUE_PAYMENT';
      if (localIndex >= 779) {
        service = 'eSIM';
        subservice = '';
        type = 'FIXED_VALUE_PIN_PURCHASE';
        currency = 'USD';
      }
    } else if (country === 'India') {
      localIndex = index - 1325;
      if (localIndex < 120) {
        if (localIndex >= 16 && localIndex < 93) subservice = 'Bundle';
        else if (localIndex >= 93) subservice = 'Data';
      } else if (localIndex < 140) {
        service = 'Utilities';
        subservice = 'Television';
      } else {
        service = 'eSIM';
        subservice = '';
        type = 'FIXED_VALUE_PIN_PURCHASE';
        currency = 'USD';
      }
    } else {
      localIndex = index - 1472;
      if (localIndex < 485) {
        if (localIndex >= 308 && localIndex < 412) subservice = 'Bundle';
        else if (localIndex >= 412) subservice = 'Data';
        if (localIndex < 5) type = 'RANGED_VALUE_RECHARGE';
      } else {
        service = 'eSIM';
        subservice = '';
        type = 'FIXED_VALUE_PIN_PURCHASE';
        currency = 'USD';
      }
    }

    const ranged = ['RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT'].includes(type);
    const pin = type === 'FIXED_VALUE_PIN_PURCHASE';
    sheet.addRow([
      100000 + index,
      'Integration fixture ' + index,
      country,
      'Test operator',
      service,
      subservice,
      type,
      currency,
      ranged ? '30 - 4000' : pin ? 1.69 : 100,
      ranged ? '0.5 - 66.33' : pin ? 1.29 : 0.5,
      ranged ? '0.56 - 73.7' : pin ? 1.44 : 0.6,
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function waitForAdvisoryLockRelease(pool) {
  const deadline = Date.now() + 10000;
  const client = await pool.connect();
  try {
    while (Date.now() < deadline) {
      const result = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [71230941]);
      if (result.rows[0]?.locked === true) {
        await client.query('SELECT pg_advisory_unlock($1)', [71230941]);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for the reconciliation worker advisory lock to release.');
  } finally {
    client.release();
  }
}

async function waitForPausedRun(pool, runId) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      'SELECT status FROM dtone_master_reconciliation_runs WHERE id = $1',
      [runId]
    );
    if (result.rows[0]?.status === 'paused') return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the real reconciliation worker to pause.');
}

test('real Express/PostgreSQL route stages 1,960 rows and worker handles GET, 404 and 429 safely', {
  skip: !process.env.DATABASE_URL,
  timeout: 45000,
}, async () => {
  const schema = 'dtone_recon_it_' + crypto.randomUUID().replace(/-/g, '');
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  let testPool;
  let server;
  const originalFetch = global.fetch;
  const calls = [];
  try {
    await adminPool.query('CREATE SCHEMA ' + schema);
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: '-c search_path=' + schema,
    });
    const migration = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '037_dtone_master_reconciliation_staging.sql'),
      'utf8'
    );
    await testPool.query(migration);

    global.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith(BASE_URL + '/')) return originalFetch(input, init);
      calls.push({ url, method: init.method, headers: init.headers, at: Date.now() });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          id: 100000,
          operator: { name: 'Test operator', country: { iso_code: 'AFG' } },
          service: { name: 'Mobile', subservice: { name: 'Airtime' } },
          type: 'FIXED_VALUE_RECHARGE',
          destination: { amount: 100, unit: 'AFN' },
          prices: {
            wholesale: { amount: 0.5, unit: 'EUR' },
            retail: { amount: 0.6, unit: 'EUR' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (calls.length === 2) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
        headers: { 'retry-after': '5' },
      });
    };

    const app = express();
    app.use(express.json());
    registerDtOneMasterWorkbookRoutes({
      app,
      express,
      pool: testPool,
      requireAdmin: (_req, _res, next) => next(),
      dtoneApiBaseUrl: BASE_URL,
      dtoneApiBaseUrlExplicit: true,
      getDtOneAuthHeader: () => 'Basic integration-fixture',
    });
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    const address = server.address();
    const origin = 'http://127.0.0.1:' + address.port;
    const workbook = await makeWorkbook();

    const upload = await originalFetch(origin + '/api/admin/dtone/master-reconciliation/runs', {
      method: 'POST',
      headers: {
        'content-type': MIME,
        'x-workbook-file-name': SOURCE_NAME,
        'x-read-only-confirmation': 'true',
      },
      body: workbook,
    });
    assert.equal(upload.status, 201);
    const staged = await upload.json();
    assert.equal(staged.totalProducts, 1960);
    assert.equal(staged.stagingOnly, true);
    assert.equal(staged.productCatalogChanged, false);
    assert.equal(staged.productsActivated, false);
    assert.equal(staged.paymentsCreated, false);
    assert.equal(staged.topupsCreated, false);

    await waitForPausedRun(testPool, staged.runId);
    await waitForAdvisoryLockRelease(testPool);

    const run = await testPool.query(
      'SELECT status, total_products FROM dtone_master_reconciliation_runs WHERE id = $1',
      [staged.runId]
    );
    assert.equal(run.rows[0].status, 'paused');
    assert.equal(Number(run.rows[0].total_products), 1960);

    const totals = await testPool.query(
      'SELECT status, COUNT(*)::int AS count FROM dtone_master_reconciliation_items WHERE run_id = $1 GROUP BY status',
      [staged.runId]
    );
    const byStatus = Object.fromEntries(totals.rows.map(row => [row.status, row.count]));
    assert.equal(byStatus.matched, 1);
    assert.equal(byStatus.missing_at_provider, 1);
    assert.equal(byStatus.pending, 1958);

    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'GET']);
    assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
      '/v1/products/100000',
      '/v1/products/100001',
      '/v1/products/100002',
    ]);
    assert.ok(calls[1].at - calls[0].at >= 900, 'at least one second between first and second provider calls');
    assert.ok(calls[2].at - calls[1].at >= 900, 'at least one second between second and third provider calls');
    for (const call of calls) {
      assert.equal(call.headers.Authorization, 'Basic integration-fixture');
      assert.equal(call.headers.Accept, 'application/json');
    }

    const reportResponse = await originalFetch(
      origin + '/api/admin/dtone/master-reconciliation/runs/' + staged.runId + '/report'
    );
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    assert.equal(report.safeToImport, false);
    assert.equal(report.productCatalogChanged, false);
    assert.equal(report.productsActivated, false);
    assert.equal(report.paymentsCreated, false);
    assert.equal(report.topupsCreated, false);
    assert.equal(report.items.length, 1960);

    const catalog = await testPool.query("SELECT to_regclass('product_catalog') AS table_name");
    assert.equal(catalog.rows[0].table_name, null, 'the reconciliation route must not create or touch the customer catalog');
  } finally {
    global.fetch = originalFetch;
    if (server) await new Promise(resolve => server.close(resolve));
    if (testPool) await testPool.end();
    await adminPool.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
    await adminPool.end();
  }
});
