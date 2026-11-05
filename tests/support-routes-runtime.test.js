'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const registerSupportRoutes = require('../support-routes');

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = Buffer.alloc(32, 7).toString('hex');
const TOKEN_HASH = crypto.createHash('sha256').update(TOKEN, 'utf8').digest('hex');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ body = {}, params = {}, query = {}, headers = {} } = {}) {
  return {
    body, params, query,
    get(name) { return headers[name.toLowerCase()] ?? headers[name] ?? ''; },
  };
}

function harness(pool) {
  const routes = new Map();
  const requireAdmin = function requireAdmin(_req, _res, next) { next(); };
  const app = {
    post(path, ...handlers) { routes.set('POST ' + path, handlers); },
    get(path, ...handlers) { routes.set('GET ' + path, handlers); },
    patch(path, ...handlers) { routes.set('PATCH ' + path, handlers); },
  };
  registerSupportRoutes({ app, pool, requireAdmin });
  return { routes, requireAdmin };
}

test('customer ticket creation fails closed without an order access token', async () => {
  let queried = false;
  const { routes } = harness({ async query() { queried = true; throw new Error('must not query'); } });
  const handler = routes.get('POST /api/support/tickets')[0];
  const res = response();
  await handler(request({
    body: { orderId: ORDER_ID, subject: 'Payment issue', message: 'Please review this order.', category: 'payment' },
  }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(queried, false);
});

test('customer ticket creation stores a ticket only after constant-time order-token verification', async () => {
  const calls = [];
  const ticket = { id: 41, order_id: ORDER_ID, subject: 'Payment issue', status: 'open', priority: 'normal' };
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT order_id, order_access_token_hash')) {
        return { rowCount: 1, rows: [{ order_id: ORDER_ID, order_access_token_hash: TOKEN_HASH }] };
      }
      if (sql.includes('INSERT INTO support_tickets')) return { rowCount: 1, rows: [ticket] };
      throw new Error('Unexpected support query');
    },
  };
  const { routes } = harness(pool);
  const res = response();
  await routes.get('POST /api/support/tickets')[0](request({
    body: { orderId: ORDER_ID, subject: 'Payment issue', message: 'Please review this order.', category: 'payment' },
    headers: { 'x-order-access-token': TOKEN },
  }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ticket.id, 41);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, [ORDER_ID, 'Payment issue', 'Please review this order.', 'payment']);
});

test('a token for another order cannot create a support ticket', async () => {
  let insertAttempted = false;
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT order_id, order_access_token_hash')) {
        return { rowCount: 1, rows: [{ order_id: ORDER_ID, order_access_token_hash: '0'.repeat(64) }] };
      }
      if (sql.includes('INSERT INTO support_tickets')) insertAttempted = true;
      throw new Error('Unexpected query');
    },
  };
  const { routes } = harness(pool);
  const res = response();
  await routes.get('POST /api/support/tickets')[0](request({
    body: { orderId: ORDER_ID, subject: 'Payment issue', message: 'Please review this order.', category: 'payment' },
    headers: { 'x-order-access-token': TOKEN },
  }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(insertAttempted, false);
});

test('customer ticket history is scoped to the verified order', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT order_access_token_hash')) {
        return { rowCount: 1, rows: [{ order_access_token_hash: TOKEN_HASH }] };
      }
      if (sql.includes('FROM support_tickets WHERE order_id = $1')) {
        return { rowCount: 1, rows: [{ id: 41, order_id: ORDER_ID, subject: 'Payment issue' }] };
      }
      throw new Error('Unexpected support query');
    },
  };
  const { routes } = harness(pool);
  const res = response();
  await routes.get('GET /api/support/tickets/order/:orderId')[0](request({
    params: { orderId: ORDER_ID },
    headers: { 'x-order-access-token': TOKEN },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tickets.length, 1);
  assert.deepEqual(calls[1].params, [ORDER_ID]);
});

test('admin support inbox and updates retain the shared admin authentication middleware', () => {
  const { routes, requireAdmin } = harness({ async query() { return { rowCount: 0, rows: [] }; } });
  assert.equal(routes.get('GET /api/admin/support/tickets')[0], requireAdmin);
  assert.equal(routes.get('PATCH /api/admin/support/tickets/:ticketId')[0], requireAdmin);
});

test('admin escalation can move a ticket to in-progress, set priority, and reply', async () => {
  const calls = [];
  const ticket = {
    id: 41,
    order_id: ORDER_ID,
    status: 'in_progress',
    priority: 'high',
    admin_reply: 'We are reviewing the provider result.',
  };
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      assert.match(sql, /UPDATE support_tickets/);
      return { rowCount: 1, rows: [ticket] };
    },
  };
  const { routes, requireAdmin } = harness(pool);
  const handlers = routes.get('PATCH /api/admin/support/tickets/:ticketId');
  assert.equal(handlers[0], requireAdmin, 'admin authentication must run before ticket updates');
  const res = response();
  await handlers[1](request({
    params: { ticketId: '41' },
    body: {
      status: 'in_progress',
      priority: 'high',
      adminReply: 'We are reviewing the provider result.',
    },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ticket.status, 'in_progress');
  assert.equal(res.body.ticket.priority, 'high');
  assert.equal(res.body.ticket.admin_reply, 'We are reviewing the provider result.');
  assert.deepEqual(calls[0].params, [
    41,
    'in_progress',
    'high',
    true,
    'We are reviewing the provider result.',
  ]);
});

test('admin escalation rejects invalid status, priority, and empty updates before database access', async () => {
  let queries = 0;
  const { routes } = harness({ async query() { queries += 1; throw new Error('must not query'); } });
  const handler = routes.get('PATCH /api/admin/support/tickets/:ticketId')[1];
  const cases = [
    { params: { ticketId: '41' }, body: { status: 'paid' } },
    { params: { ticketId: '41' }, body: { priority: 'blocker' } },
    { params: { ticketId: '41' }, body: {} },
    { params: { ticketId: 'not-an-id' }, body: { status: 'open' } },
  ];
  for (const input of cases) {
    const res = response();
    await handler(request(input), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(queries, 0);
});

