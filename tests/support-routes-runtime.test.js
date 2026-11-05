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
      throw new Error('Unexpected pool query');
    },
    async connect() {
      return {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql === 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))') return { rowCount: 1, rows: [] };
          if (sql.includes('SELECT COUNT(*)::int AS ticket_count')) return { rowCount: 1, rows: [{ ticket_count: 0, oldest_ticket_at: null }] };
          if (sql.includes('INSERT INTO support_tickets')) return { rowCount: 1, rows: [ticket] };
          return { rowCount: 0, rows: [] };
        },
        release() { calls.push({ sql: 'RELEASE' }); },
      };
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
  assert.ok(calls.some((call) => call.sql === 'BEGIN'));
  assert.ok(calls.some((call) => call.sql === 'COMMIT'));
  assert.ok(calls.some((call) => call.sql === 'RELEASE'));
  const insert = calls.find((call) => call.sql.includes('INSERT INTO support_tickets'));
  assert.deepEqual(insert.params, [ORDER_ID, 'Payment issue', 'Please review this order.', 'payment']);
});


test('customer ticket creation is rate limited atomically after three tickets in fifteen minutes', async () => {
  const calls = [];
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT order_id, order_access_token_hash')) {
        return { rowCount: 1, rows: [{ order_id: ORDER_ID, order_access_token_hash: TOKEN_HASH }] };
      }
      throw new Error('Unexpected pool query');
    },
    async connect() {
      return {
        async query(sql) {
          calls.push(sql);
          if (sql.includes('SELECT COUNT(*)::int AS ticket_count')) {
            return { rowCount: 1, rows: [{ ticket_count: 3, oldest_ticket_at: new Date(Date.now() - 60_000).toISOString() }] };
          }
          return { rowCount: 0, rows: [] };
        },
        release() { calls.push('RELEASE'); },
      };
    },
  };
  const { routes } = harness(pool);
  const res = response();
  await routes.get('POST /api/support/tickets')[0](request({
    body: { orderId: ORDER_ID, subject: 'Payment issue', message: 'Please review this order.', category: 'payment' },
    headers: { 'x-order-access-token': TOKEN },
  }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'SUPPORT_TICKET_RATE_LIMITED');
  assert.ok(res.body.retryAfterSeconds > 0);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(calls.includes('RELEASE'));
  assert.equal(calls.some((sql) => String(sql).includes('INSERT INTO support_tickets')), false);
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
