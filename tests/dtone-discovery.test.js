'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('DT One product discovery supports all four requested country ISO codes', () => {
  for (const code of ['AFG', 'PAK', 'IND', 'BGD']) {
    assert.match(server, new RegExp('<option value="' + code + '"'));
  }
  const routeStart = server.indexOf("app.get('/api/admin/dtone/operators', requireAdmin");
  const routeEnd = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /countryIsoCode/);
  assert.match(route, /operator\?\.country\?\.iso_code/);
});

test('DT One product discovery allows an omitted amount filter', () => {
  assert.match(server, /req\.query\.amount == null \|\| String\(req\.query\.amount\)\.trim\(\) === ''/);
  assert.match(server, /\? null\s*: Number\(req\.query\.amount\)/);
  assert.match(server, /amountQuery !== null && \(!Number\.isFinite\(amountQuery\) \|\| amountQuery <= 0\)/);
  assert.match(server, /amountQuery === null\s*\|\|\s*benefitAmounts\.includes\(amountQuery\)/);
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

test('DT One operator discovery returns compact read-only network results', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/operators', requireAdmin");
  const end = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin", start);
  assert.ok(start >= 0 && end > start, 'operator discovery route should be present before product discovery');
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/operators/);
  assert.match(route, /operatorCount/);
  assert.match(route, /transactionCreated: false/);
  assert.match(route, /catalogActivation: 'unchanged'/);
  assert.doesNotMatch(route, /INSERT INTO product_catalog|UPDATE product_catalog|POST.*\/v1\/transactions/i);
  assert.match(server, /id="discoverOperators"/);
});
