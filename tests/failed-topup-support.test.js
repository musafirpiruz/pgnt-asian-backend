// Source-level regression checks for customer support after a failed top-up.
// These checks do not call Stripe, DT One, or a live database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const support = fs.readFileSync(path.join(__dirname, '..', 'support-routes.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('customer support ticket API supports top-up and refund categories', () => {
  assert.match(support, /TICKET_CATEGORIES = new Set\(\['payment', 'topup', 'refund'/);
  assert.match(support, /app\.post\('\/api\/support\/tickets'/);
});

test('customer must prove access to the order before opening a support ticket', () => {
  const start = support.indexOf("app.post('/api/support/tickets'");
  const end = support.indexOf("app.get('/api/support/tickets/order/:orderId'", start);
  const route = start >= 0 && end > start ? support.slice(start, end) : '';
  assert.notEqual(start, -1);
  assert.match(route, /x-order-access-token/);
  assert.match(route, /tokenMatches\(accessToken, orderResult\.rows\[0\]\.order_access_token_hash\)/);
  assert.match(route, /INSERT INTO support_tickets/);
  assert.match(route, /status, priority\)\s*VALUES[^]*'open', 'normal'/);
});

test('customer can retrieve their own support-ticket history only with a valid order token', () => {
  const start = support.indexOf("app.get('/api/support/tickets/order/:orderId'");
  const end = support.indexOf("app.get('/api/admin/support/tickets'", start);
  const route = start >= 0 && end > start ? support.slice(start, end) : '';
  assert.notEqual(start, -1);
  assert.match(route, /tokenMatches\(accessToken, orderResult\.rows\[0\]\.order_access_token_hash\)/);
  assert.match(route, /FROM support_tickets WHERE order_id = \$1/);
});

test('support inbox and ticket updates are protected by admin authentication', () => {
  assert.match(support, /app\.get\('\/api\/admin\/support\/tickets', requireAdmin/);
  assert.match(support, /app\.patch\('\/api\/admin\/support\/tickets\/:ticketId', requireAdmin/);
  assert.match(support, /adminReply/);
  assert.match(support, /TICKET_PRIORITIES/);
});

test('server registers the support routes with the existing admin guard', () => {
  assert.match(server, /require\('\.\/support-routes'\)\(\{/);
  assert.match(server, /requireAdmin,/);
});

test('these checks are source-only and never issue a payment or refund', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|stripe\.refunds\.create\s*\(/);
});
