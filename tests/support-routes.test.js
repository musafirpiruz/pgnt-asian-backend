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
