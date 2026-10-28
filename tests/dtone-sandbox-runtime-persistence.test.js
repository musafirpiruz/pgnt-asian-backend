'use strict';

// Runtime regression test with injected app/database and a mocked fetch.
// This never contacts DT One, Stripe, or a real database.
const test = require('node:test');
const assert = require('node:assert/strict');

const registerDtOneSandboxTest = require('../dtone-sandbox-test');

test('sandbox route reports unknown outcome when provider accepted but local result update affects zero rows', async () => {
  let postHandler;
  const app = {
    post(route, ...handlers) {
      if (route === '/api/admin/dtone/sandbox-test') postHandler = handlers[handlers.length - 1];
    },
    get() {},
  };

  const updates = [];
  let queryCount = 0;
  const pool = {
    async query(sql, params) {
      queryCount++;
      const normalized = sql.replace(/\\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id, product_id, price_eur_cents FROM product_catalog')) {
        return { rowCount: 1, rows: [{ id: 123, product_id: 7194, price_eur_cents: 210 }] };
      }
      if (normalized.startsWith('INSERT INTO orders')) return { rowCount: 1, rows: [] };
      if (normalized.startsWith('UPDATE orders')) {
        updates.push({ sql: normalized, params });
        if (normalized.includes('SET dtone_transaction_id = COALESCE')) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [] };
      }
      throw new Error('Unexpected SQL in test: ' + normalized);
    },
  };

  registerDtOneSandboxTest({
    app,
    pool,
    requireAdmin: (_req, _res, next) => next(),
    DTONE_API_KEY: 'fake-key',
    DTONE_API_SECRET: 'fake-secret',
    DTONE_API_BASE_URL: 'https://preprod-dvs-api.dtone.com',
    DTONE_CALLBACK_URL: 'https://example.invalid/api/dtone/callback',
    getDtOneAuthHeader: () => 'Basic fake',
  });

  assert.equal(typeof postHandler, 'function', 'sandbox route handler should be registered');

  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  let responsePayload;
  let responseStatus;
  const res = {
    status(code) { responseStatus = code; return this; },
    json(payload) { responsePayload = payload; return this; },
  };

  global.fetch = async () => ({
    ok: true,
    status: 202,
    async text() { return JSON.stringify({ id: 'dtone-fake-123', status: 'COMPLETED' }); },
  });
  console.warn = () => {};
  console.error = () => {};

  try {
    await postHandler({ body: { confirmSandbox: true, scenario: 'completed' } }, res);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  }

  assert.equal(responseStatus, 502);
  assert.equal(responsePayload.created, false);
  assert.match(responsePayload.error, /outcome is unknown/i);
  assert.ok(updates.some(update => update.sql.includes("dtone_status = 'sandbox_test_outcome_unknown'")),
    'route should mark the test order for reconciliation');
  assert.ok(queryCount >= 4);
});
