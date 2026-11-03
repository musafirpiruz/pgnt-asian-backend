'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('admin country registry is protected and read-only on listing', () => {
  const start = server.indexOf("app.get('/api/admin/countries', requireAdmin");
  const end = server.indexOf("app.post('/api/admin/countries'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /FROM country_registry/);
  assert.match(route, /LEFT JOIN country_provider_mappings/);
  assert.doesNotMatch(route, /\b(INSERT|UPDATE|DELETE)\s+/i);
});

test('new country creation is admin-only and hard-codes draft status', () => {
  const start = server.indexOf("app.post('/api/admin/countries', requireAdmin");
  const end = server.indexOf("app.get('/api/countries/active'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /BEGIN/);
  assert.match(route, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,'draft'\)/);
  assert.match(route, /country_draft_created/);
  assert.match(route, /customerVisible: false/);
  assert.match(route, /checkoutEnabled: false/);
  assert.match(route, /productsActivated: false/);
  assert.doesNotMatch(route, /status\s*=\s*'active'/i);
  assert.match(route, /ROLLBACK/);
});

test('customer country discovery returns only explicitly active registry entries', () => {
  const start = server.indexOf("app.get('/api/countries/active'");
  const end = server.indexOf('// Read-only wallet integrity diagnostics.', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /FROM country_registry/);
  assert.match(route, /WHERE status IN \('active','legacy'\)/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE\s+country_registry|DELETE FROM/i);
});
