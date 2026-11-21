'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const support = fs.readFileSync(path.join(__dirname, '..', 'support-routes.js'), 'utf8');

test('support routes are registered by the main server', () => {
  assert.match(server, /require\(['"]\.\/support-routes['"]\)/);
});

test('customer support endpoints require a valid order ID and order access token', () => {
  assert.match(support, /app\.post\(['"]\/api\/support\/tickets['"]/);
  assert.match(support, /app\.get\(['"]\/api\/support\/tickets\/order\/:orderId['"]/);
  assert.match(support, /x-order-access-token/);
  assert.match(support, /order_access_token_hash/);
  assert.match(support, /tokenMatches\(accessToken/);
});

test('customer tickets cannot be created without bounded subject and message fields', () => {
  assert.match(support, /subject\.length < 4 \|\| subject\.length > 160/);
  assert.match(support, /message\.length < 10 \|\| message\.length > 4000/);
  assert.match(support, /TICKET_CATEGORIES/);
});

test('admin ticket listing and updates use existing admin authentication', () => {
  assert.match(support, /app\.get\(['"]\/api\/admin\/support\/tickets['"], requireAdmin/);
  assert.match(support, /app\.patch\(['"]\/api\/admin\/support\/tickets\/:ticketId['"], requireAdmin/);
  assert.match(support, /TICKET_STATUSES/);
  assert.match(support, /TICKET_PRIORITIES/);
});

test('customer-facing ticket history returns only tickets belonging to the verified order', () => {
  assert.match(support, /WHERE order_id = \$1 ORDER BY created_at DESC LIMIT 50/);
  assert.match(support, /admin_reply/);
});

test('support source tests do not call external services or issue refunds', () => {
  const testSource = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(testSource, /fetch\(|stripe\.refunds\.create/);
});


test('Support role cannot change ticket status or priority through the API', async () => {
  const registerSupportRoutes = require('../support-routes');
  let patchHandler;
  const app = {
    post() {},
    get() {},
    patch(_path, _middleware, handler) { patchHandler = handler; },
  };
  let queryCalls = 0;
  const pool = { async query() { queryCalls += 1; return { rowCount: 1, rows: [{ id: 7, status: 'open', priority: 'normal' }] }; } };
  registerSupportRoutes({ app, pool, requireAdmin(_req, _res, next) { next(); } });
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  const deniedStatus = response();
  await patchHandler({ params: { ticketId: '7' }, body: { adminReply: 'We are checking this.', status: 'in_progress' }, admin: { role: 'support' } }, deniedStatus);
  assert.equal(deniedStatus.statusCode, 403);
  assert.equal(queryCalls, 0);

  const deniedPriority = response();
  await patchHandler({ params: { ticketId: '7' }, body: { priority: 'urgent' }, admin: { role: 'support' } }, deniedPriority);
  assert.equal(deniedPriority.statusCode, 403);
  assert.equal(queryCalls, 0);
});

test('Support role can send a reply without changing ticket workflow fields', async () => {
  const registerSupportRoutes = require('../support-routes');
  let patchHandler;
  const app = { post() {}, get() {}, patch(_path, _middleware, handler) { patchHandler = handler; } };
  let queryParams;
  const pool = { async query(_sql, params) { queryParams = params; return { rowCount: 1, rows: [{ id: 7, status: 'open', priority: 'normal' }] }; } };
  registerSupportRoutes({ app, pool, requireAdmin() {} });
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await patchHandler({ params: { ticketId: '7' }, body: { adminReply: 'We are checking this.' }, admin: { role: 'support' } }, res);
  assert.equal(res.statusCode, undefined);
  assert.equal(queryParams[1], null);
  assert.equal(queryParams[2], null);
  assert.equal(queryParams[4], 'We are checking this.');
});

test('Owner role can still update ticket status and priority', async () => {
  const registerSupportRoutes = require('../support-routes');
  let patchHandler;
  const app = { post() {}, get() {}, patch(_path, _middleware, handler) { patchHandler = handler; } };
  let queryParams;
  const pool = { async query(_sql, params) { queryParams = params; return { rowCount: 1, rows: [{ id: 7, status: 'in_progress', priority: 'urgent' }] }; } };
  registerSupportRoutes({ app, pool, requireAdmin() {} });
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await patchHandler({ params: { ticketId: '7' }, body: { status: 'in_progress', priority: 'urgent', adminReply: 'Owner review.' }, admin: { role: 'owner' } }, res);
  assert.equal(res.statusCode, undefined);
  assert.equal(queryParams[1], 'in_progress');
  assert.equal(queryParams[2], 'urgent');
});
