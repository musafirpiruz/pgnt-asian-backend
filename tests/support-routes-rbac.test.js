'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registerSupportRoutes = require('../support-routes');

function makeApp() {
  const routes = new Map();
  return {
    routes,
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
    patch(path, ...handlers) { routes.set(`PATCH ${path}`, handlers.at(-1)); },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('support inbox query masks phone number and charge amount for support role', async () => {
  const app = makeApp();
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [{ id: 1, phone: null, charge_cents: null }] };
    },
  };
  registerSupportRoutes({ app, pool, requireAdmin: (_req, _res, next) => next() });
  const handler = app.routes.get('GET /api/admin/support/tickets');
  const req = { admin: { role: 'support' }, query: { status: '', limit: 50 } };
  const res = responseRecorder();
  await handler(req, res);

  assert.match(captured.sql, /CASE WHEN \$3 = 'owner' THEN o\.phone ELSE NULL END AS phone/);
  assert.match(captured.sql, /CASE WHEN \$3 = 'owner' THEN o\.charge_cents ELSE NULL END AS charge_cents/);
  assert.deepEqual(captured.params, ['', 50, 'support']);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tickets[0].phone, null);
  assert.equal(res.body.tickets[0].charge_cents, null);
});

test('legacy Owner-equivalent admin query retains order support details during migration', async () => {
  const app = makeApp();
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
  };
  registerSupportRoutes({ app, pool, requireAdmin: (_req, _res, next) => next() });
  const handler = app.routes.get('GET /api/admin/support/tickets');
  const req = { admin: { role: 'owner' }, query: {} };
  const res = responseRecorder();
  await handler(req, res);

  assert.deepEqual(captured.params, ['', 50, 'owner']);
  assert.equal(res.statusCode, 200);
});
