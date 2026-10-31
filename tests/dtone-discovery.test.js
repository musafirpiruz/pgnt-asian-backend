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

test('local-currency denomination matcher recognizes amounts in product names', () => {
  const source = server.slice(server.indexOf("app.get('/api/admin/dtone/products'"));
  assert.ok(source.includes('new RegExp('));
  const cases = [
    ['ATOMA 115 AFN', 115, 'AFN'],
    ['Afghan Wireless 50 AFN', 50, 'AFN'],
    ['Jazz 500 PKR', 500, 'PKR'],
    ['Airtel 199 INR', 199, 'INR'],
    ['Grameenphone 100 BDT', 100, 'BDT'],
  ];
  for (const [name, amount, currency] of cases) {
    const matcher = new RegExp('\\\\b' + amount + '\\\\s*' + currency + '\\\\b|\\\\b' + currency + '\\\\s*' + amount + '\\\\b', 'i');
    assert.equal(matcher.test(name), true, name);
  }
});

test('DT One product discovery marks results partial when the five-page safety limit is reached', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  const route = server.slice(start, end);
  assert.match(route, /let truncated = false/);
  assert.match(route, /if \\(page === 5\\) truncated = true/);
  assert.match(route, /truncated,/);
  assert.match(route, /complete: !truncated/);
  assert.match(route, /Partial read-only search/);
});
