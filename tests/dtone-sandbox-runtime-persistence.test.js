'use strict';

// Runtime regression test for the disabled legacy sandbox route.
// It uses injected stubs and must never contact DT One or a real database.
const test = require('node:test');
const assert = require('node:assert/strict');
const registerDtOneSandboxTest = require('../dtone-sandbox-test');

test('legacy sandbox POST returns HTTP 410 without querying the database or contacting DT One', async () => {
  let postHandler;
  const app = {
    post(route, ...handlers) {
      if (route === '/api/admin/dtone/sandbox-test') postHandler = handlers[handlers.length - 1];
    },
    get() {},
  };

  let queryCount = 0;
  const pool = {
    async query() {
      queryCount += 1;
      throw new Error('Disabled legacy POST must not query the database');
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

  assert.equal(typeof postHandler, 'function', 'sandbox POST route should remain registered');

  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    throw new Error('Disabled legacy POST must not contact DT One');
  };

  let responsePayload;
  let responseStatus;
  const res = {
    status(code) { responseStatus = code; return this; },
    json(payload) { responsePayload = payload; return this; },
  };

  try {
    await postHandler({ body: { confirmSandbox: true, scenario: 'completed' } }, res);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(responseStatus, 410);
  assert.equal(responsePayload.created, false);
  assert.equal(responsePayload.sandboxOnly, true);
  assert.equal(responsePayload.legacyRouteDisabled, true);
  assert.equal(queryCount, 0);
  assert.equal(fetchCount, 0);
});
