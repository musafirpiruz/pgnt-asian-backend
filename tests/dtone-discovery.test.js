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

test('product-name denomination matching uses the selected country local currency', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  const route = server.slice(start, end);
  assert.match(route, /AFG:\s*'AFN'.*PAK:\s*'PKR'.*IND:\s*'INR'.*BGD:\s*'BDT'/s);
  assert.match(route, /new RegExp\(`\\\\b\$\{amountQuery\}\\\\s\*\$\{localCurrency\}\\\\b/);
  const cases = [
    ['ATOMA 115 AFN', 115, 'AFN'],
    ['Jazz 500 PKR', 500, 'PKR'],
    ['Airtel 199 INR', 199, 'INR'],
    ['Grameenphone 100 BDT', 100, 'BDT'],
  ];
  for (const [name, amount, currency] of cases) {
    const matcher = new RegExp('\\b' + amount + '\\s*' + currency + '\\b|\\b' + currency + '\\s*' + amount + '\\b', 'i');
    assert.equal(matcher.test(name), true, name);
  }
});

test('product discovery explicitly flags a partial result when the page safety limit is reached', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin");
  const end = server.indexOf('// Read-only verification of a catalog product', start);
  const route = server.slice(start, end);
  assert.match(route, /let truncated = false/);
  assert.match(route, /if \(page === 20\) truncated = true/);
  assert.match(route, /truncated,/);
  assert.match(route, /complete: !truncated/);
  assert.match(route, /Partial read-only search/);
});


test('DT One operator discovery accepts only the four supported provider country codes', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/operators', requireAdmin");
  const end = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin", start);
  const route = server.slice(start, end);
  assert.match(route, /new Set\(\['AFG', 'PAK', 'IND', 'BGD'\]\)/);
  assert.match(route, /supportedOperatorCountries\.has\(countryIsoCode\)/);
  assert.match(route, /one of AFG, PAK, IND, or BGD/);
});

test('DT One operator discovery marks a page-limit result as partial', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/operators', requireAdmin");
  const end = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin", start);
  const route = server.slice(start, end);
  assert.match(route, /const maxPages = 20/);
  assert.match(route, /const pageSize = 100/);
  assert.match(route, /if \(page === maxPages\) truncated = true/);
  assert.match(route, /truncated,/);
  assert.match(route, /complete: !truncated/);
  assert.match(route, /Partial read-only operator list/);
});

test('DT One operator discovery rejects an unexpected successful response shape', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/operators', requireAdmin");
  const end = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin", start);
  const route = server.slice(start, end);
  assert.match(route, /Array\.isArray\(data\)/);
  assert.match(route, /Array\.isArray\(data\?\.items\)/);
  assert.match(route, /unexpected operator-list response/);
});

test('DT One operator discovery remains GET-only and does not mutate catalog or create transactions', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/operators', requireAdmin");
  const end = server.indexOf("app.get('/api/admin/dtone/products', requireAdmin", start);
  const route = server.slice(start, end);
  assert.match(route, /method: 'GET'/);
  assert.match(route, /catalogActivation: 'unchanged'/);
  assert.match(route, /transactionCreated: false/);
  assert.doesNotMatch(route, /INSERT INTO product_catalog|UPDATE product_catalog|POST.*\/v1\/transactions/i);
});
