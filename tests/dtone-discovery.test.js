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


test('automatic country catalog discovery supports only the four configured countries', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country', requireAdmin");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  assert.ok(start >= 0 && end > start, 'automatic country catalog sync route should exist');
  const route = server.slice(start, end);
  for (const code of ['AFG', 'PAK', 'IND', 'BGD']) assert.ok(route.includes(code));
  assert.match(route, /countryCurrency\(country\)/);
});

test('automatic country catalog sync previews before import and requires explicit confirmation', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country', requireAdmin");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  const route = server.slice(start, end);
  assert.match(route, /confirmImport = req\.body\?\.confirmImport === true/);
  assert.match(route, /if \(!confirmImport\) return res\.json\(summary\)/);
  assert.match(route, /importRequiresExplicitConfirmation: true/);
  assert.match(server, /countryCatalogPreviewReady&&confirmCountryCatalogImport\.checked/);
});

test('automatic country catalog sync never activates products or creates transactions', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country', requireAdmin");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  const route = server.slice(start, end);
  assert.match(route, /active, updated_at\)/);
  assert.match(route, /FALSE, NOW\(\)/);
  assert.match(route, /productsRemainDisabled: true/);
  assert.match(route, /transactionCreated: false/);
  assert.match(route, /paymentCreated: false/);
  assert.doesNotMatch(route, /UPDATE product_catalog SET active\s*=\s*TRUE|POST.*\/v1\/transactions/i);
});

test('automatic country catalog sync deduplicates DT One product IDs and denomination conflicts', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country', requireAdmin");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  const route = server.slice(start, end);
  assert.match(route, /existingIdSet\.has\(product\.productId\)/);
  assert.match(route, /byDenomination\.has\(key\)/);
  assert.match(route, /ON CONFLICT DO NOTHING/);
  assert.match(route, /manual review required/);
});

test('admin DT One page exposes the automatic country catalog preview and confirmation controls', () => {
  assert.match(server, /id="autoBuildCountryCatalog"/);
  assert.match(server, /id="confirmCountryCatalogImport"/);
  assert.match(server, /Automatically build selected country catalog/);
});


test('automatic country catalog sync verifies full DT One product details before pricing or import', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country', requireAdmin");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/products\/\$\{listedProduct\.id\}/);
  assert.match(route, /detailProductsVerified: detailedProducts\.length/);
  assert.match(route, /Could not verify full DT One product details/);
});

test('automatic catalog admin confirmation keeps the admin key available for the second step', () => {
  const start = server.indexOf("autoBuildCountryCatalog.addEventListener('click'");
  const end = server.indexOf("document.getElementById('catalogCountry').addEventListener", start);
  const handler = server.slice(start, end);
  assert.doesNotMatch(handler, /key\.value\s*=\s*''/);
  assert.match(handler, /countryCatalogPreviewReady&&confirmCountryCatalogImport\.checked/);
});


test('automatic country catalog preview calculates customer EUR pricing for every valid product', () => {
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country', requireAdmin");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  const route = server.slice(start, end);
  assert.match(route, /const productPricePreviews = toInsert\.map/);
  assert.match(route, /wholesaleCostEur:/);
  assert.match(route, /providerRetailPriceEur:/);
  assert.match(route, /estimatedStripeFeeEur:/);
  assert.match(route, /estimatedCustomerPriceEur:/);
  assert.match(route, /productPricePreviews,/);
});
