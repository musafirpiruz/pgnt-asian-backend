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


// Exercise the real support route handlers with the same RBAC mapper and
// permission middleware used by server.js, rather than checking source text only.
const { createAdminRbac, permissionForAdminRequest } = require('../admin-rbac');

function makePipelineApp() {
  const routes = new Map();
  const register = (method) => (path, ...handlers) => routes.set(`${method} ${path}`, handlers);
  return { routes, get: register('GET'), post: register('POST'), patch: register('PATCH') };
}

function makeAdminGate(uid) {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: async (req, res, next) => {
      req.auth = { uid };
      return next();
    },
    ownerUid: 'owner-uid',
    supportUid: 'support-uid',
  });
  return async (req, res) => {
    let authorized = false;
    await rbac.authenticateAdmin(req, res, () => {
      const permission = permissionForAdminRequest(req);
      rbac.requireAdminPermission(permission)(req, res, () => { authorized = true; });
    });
    return authorized;
  };
}

async function invokeAdminRoute(handlers, req, res, authorize) {
  assert.equal(typeof handlers?.[0], 'function', 'route must register an admin middleware');
  assert.equal(await authorize(req, res), true);
  const routeHandler = handlers[handlers.length - 1];
  await routeHandler(req, res);
}

test('real support ticket list and escalation routes authorize Support and preserve verified UID', async () => {
  const app = makePipelineApp();
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/SELECT t\.id/.test(sql)) return { rowCount: 1, rows: [{ id: 42, phone: null, charge_cents: null }] };
      if (/INSERT INTO support_ticket_escalations/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 7, ticket_id: 42, status: 'pending' }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  registerSupportRoutes({ app, pool, requireAdmin: (_req, _res, next) => next() });
  const authorize = makeAdminGate('support-uid');

  const listRes = responseRecorder();
  await invokeAdminRoute(app.routes.get('GET /api/admin/support/tickets'), {
    method: 'GET', path: '/api/admin/support/tickets', admin: undefined,
    query: {},
  }, listRes, authorize);
  assert.equal(listRes.statusCode, 200);
  assert.deepEqual(queries[0].params, ['', 50, 'support']);
  assert.match(queries[0].sql, /CASE WHEN \$3 = 'owner' THEN o\.phone ELSE NULL END/);

  const escalationReq = {
    method: 'POST', path: '/api/admin/support/tickets/42/escalate',
    params: { ticketId: '42' }, body: { note: 'Needs owner review' },
  };
  const escalationRes = responseRecorder();
  // The production requireAdmin middleware attaches the verified role before
  // the route handler runs; reproduce that attachment in this test harness.
  const originalAuthorize = authorize;
  const supportAuthorize = async (req, res) => {
    const allowed = await originalAuthorize(req, res);
    if (allowed) req.admin = { uid: 'support-uid', role: 'support' };
    return allowed;
  };
  await invokeAdminRoute(app.routes.get('POST /api/admin/support/tickets/:ticketId/escalate'), escalationReq, escalationRes, supportAuthorize);
  assert.equal(escalationRes.statusCode, 201);
  assert.deepEqual(queries[1].params, [42, 'support-uid', 'Needs owner review']);
});

test('Support is blocked from Owner escalation lifecycle routes while Owner can resolve', async () => {
  const app = makePipelineApp();
  const pool = {
    async query() { return { rowCount: 1, rows: [{ id: 7, ticket_id: 42, status: 'resolved' }] }; },
  };
  registerSupportRoutes({ app, pool, requireAdmin: (_req, _res, next) => next() });

  const supportReq = {
    method: 'POST', path: '/api/admin/support/escalations/7/resolve',
    params: { escalationId: '7' }, admin: { uid: 'support-uid', role: 'support' },
  };
  const supportRes = responseRecorder();
  const supportGate = makeAdminGate('support-uid');
  assert.equal(await supportGate(supportReq, supportRes), false);
  assert.equal(supportRes.statusCode, 403);

  const ownerReq = {
    method: 'POST', path: '/api/admin/support/escalations/7/resolve',
    params: { escalationId: '7' }, admin: { uid: 'owner-uid', role: 'owner' },
  };
  const ownerRes = responseRecorder();
  const ownerGate = makeAdminGate('owner-uid');
  assert.equal(await ownerGate(ownerReq, ownerRes), true);
  ownerReq.admin = { uid: 'owner-uid', role: 'owner' };
  await app.routes.get('POST /api/admin/support/escalations/:escalationId/resolve').at(-1)(ownerReq, ownerRes);
  assert.equal(ownerRes.statusCode, 200);
});


test('Support can reply but cannot change ticket status or priority', async () => {
  const app = makeApp();
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 1, rows: [{ id: 42, admin_reply: params[4] }] };
    },
  };
  registerSupportRoutes({ app, pool, requireAdmin: (_req, _res, next) => next() });
  const handler = app.routes.get('PATCH /api/admin/support/tickets/:ticketId');

  const deniedRes = responseRecorder();
  await handler({
    params: { ticketId: '42' },
    admin: { uid: 'support-uid', role: 'support' },
    body: { adminReply: 'We are checking this for you.', status: 'resolved' },
  }, deniedRes);
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(calls.length, 0, 'denied Support mutation must not reach the database');

  const replyRes = responseRecorder();
  await handler({
    params: { ticketId: '42' },
    admin: { uid: 'support-uid', role: 'support' },
    body: { adminReply: 'We are checking this for you.' },
  }, replyRes);
  assert.equal(replyRes.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[1], null, 'Support cannot change ticket status');
  assert.equal(calls[0].params[2], null, 'Support cannot change ticket priority');
});

test('Owner retains ticket status and priority controls', async () => {
  const app = makeApp();
  let captured;
  const pool = {
    async query(sql, params) {
      captured = params;
      return { rowCount: 1, rows: [{ id: 42, status: 'resolved', priority: 'normal' }] };
    },
  };
  registerSupportRoutes({ app, pool, requireAdmin: (_req, _res, next) => next() });
  const handler = app.routes.get('PATCH /api/admin/support/tickets/:ticketId');
  const res = responseRecorder();
  await handler({
    params: { ticketId: '42' },
    admin: { uid: 'owner-uid', role: 'owner' },
    body: { status: 'resolved', priority: 'normal' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(captured[1], 'resolved');
  assert.equal(captured[2], 'normal');
});
