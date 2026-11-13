'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('ranged DT One import accepts numeric provider product IDs and rejects malformed IDs', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/ranged-products/import'");
  const end = server.indexOf("app.get('/api/admin/catalog/:productId/pricing'", start);
  assert.ok(start >= 0 && end > start, 'ranged product import route must exist');
  const route = server.slice(start, end);
  assert.match(route, /!\/\^\[1-9\]\\d\{0,17\}\$\//);
  const validator = /^[1-9]\d{0,17}$/;
  for (const id of ['1', '98765', '123456789012345678']) {
    assert.equal(validator.test(id), true, id);
  }
  for (const id of ['', '0', '0123', 'abc', '12.3', '1234567890123456789']) {
    assert.equal(validator.test(id), false, id);
  }
});
