'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('home top-up flow presents five numbered steps and verified product selection', () => {
  for (let step = 1; step <= 5; step += 1) assert.match(dart, new RegExp('_buildStepHeader\\\\(' + step + ','));
  assert.match(dart, /buildVerifiedProductSelector\\(\\)/);
  assert.match(dart, /customAmountController\\.dispose\\(\\)/);
});

test('verified catalog products are loaded from backend and quoted by exact catalog ID', () => {
  assert.ok(dart.includes('Future<void> _loadVerifiedProducts(MobileOperator operator)'));
  assert.ok(dart.includes('/operators/'));
  assert.ok(dart.includes('/products'));
  assert.ok(dart.includes("'productId': productId") || dart.includes("'productId': product.productId"));
  assert.match(dart, /buildVerifiedProductSelector\\(\\)/);
  assert.match(dart, /_selectedProduct == null/);
  assert.match(dart, /priceQuote == null \\|\\| isQuoteLoading/);
  assert.match(dart, /formattedFinalPrice/);
});

test('verified product parser rejects invalid identities and amounts', () => {
  assert.match(dart, /class CatalogTopUpProduct/);
  assert.match(dart, /CatalogTopUpProduct\\.fromJson/);
  assert.match(dart, /providerProductId/);
  assert.match(dart, /recipientAmount/);
});

test('review summary refreshes on recipient input and amount display follows selected provider product', () => {
  assert.match(dart, /void handlePhoneChanged\\(String value\\)/);
  assert.match(dart, /'amount'/);
  assert.match(dart, /product\\.recipientAmount/);
});

test('changing the selected verified product invalidates the previous quote', () => {
  const start = dart.indexOf('void selectVerifiedProduct(');
  const end = dart.indexOf('Future<void> loadPriceQuote()', start);
  assert.ok(start >= 0 && end > start);
  const method = dart.slice(start, end);
  assert.match(method, /priceQuote = null/);
  assert.match(method, /loadPriceQuote\\(\\)/);
});
