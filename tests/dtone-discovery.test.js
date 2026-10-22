'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('DT One product discovery supports all four requested country ISO codes', () => {
  for (const code of ['AFG', 'PAK', 'IND', 'BGD']) {
    assert.match(server, new RegExp(code + ': \'(?:AFN|PKR|INR|BDT)\''));
    assert.match(server, new RegExp('<option value="' + code + '"'));
  }
});

test('DT One product discovery allows an omitted amount filter', () => {
  assert.match(server, /req\.query\.amount === undefined \|\| String\(req\.query\.amount\)\.trim\(\) === '' \? null : Number\(req\.query\.amount\)/);
  assert.match(server, /amountQuery !== null && \(!Number\.isFinite\(amountQuery\) \|\| amountQuery <= 0\)/);
  assert.match(server, /amountQuery === null \|\| mentionsAmount/);
});

test('DT One product discovery remains read-only', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin");
  const end = server.indexOf("// Read-only verification of a catalog product", start);
  assert.ok(start >= 0 && end > start, 'product discovery route should be present');
  const route = server.slice(start, end);
  assert.match(route, /method: 'GET'/);
  assert.match(route, /transactionCreated: false/);
  assert.match(route, /catalogActivation: 'unchanged'/);
  assert.doesNotMatch(route, /INSERT INTO product_catalog|UPDATE product_catalog|POST.*\/v1\/transactions/i);
});
