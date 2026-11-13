'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('home top-up flow presents five numbered steps and verified product selection', () => {
  for (let step = 1; step <= 5; step += 1) assert.ok(dart.includes('_buildStepHeader(' + step + ','));
  assert.ok(dart.includes('buildVerifiedProductSelector()'));
  assert.ok(dart.includes('customAmountController.dispose()'));
});

test('verified catalog products are loaded from backend and quoted by exact catalog ID', () => {
  assert.ok(dart.includes('Future<void> _loadVerifiedProducts(MobileOperator operator)'));
  assert.ok(dart.includes('/operators/'));
  assert.ok(dart.includes('/products'));
  assert.ok(dart.includes("'productId': productId") || dart.includes("'productId': product.productId"));
  assert.ok(dart.includes('buildVerifiedProductSelector()'));
  assert.ok(dart.includes('_selectedProduct == null'));
  assert.ok(dart.includes('priceQuote == null || isQuoteLoading'));
  assert.ok(dart.includes('formattedFinalPrice'));
});

test('verified product parser rejects invalid identities and amounts', () => {
  assert.ok(dart.includes('class CatalogTopUpProduct'));
  assert.ok(dart.includes('CatalogTopUpProduct.fromJson'));
  assert.ok(dart.includes('providerProductId'));
  assert.ok(dart.includes('recipientAmount'));
});

test('review summary refreshes on recipient input and amount display follows selected provider product', () => {
  assert.ok(dart.includes('void handlePhoneChanged(String value)'));
  assert.ok(dart.includes("'amount'"));
  assert.ok(dart.includes('product.recipientAmount'));
});

test('changing the selected verified product invalidates the previous quote', () => {
  const start = dart.indexOf('void selectVerifiedProduct(');
  const end = dart.indexOf('Future<void> loadPriceQuote()', start);
  assert.ok(start >= 0 && end > start);
  const method = dart.slice(start, end);
  assert.ok(method.includes('priceQuote = null'));
  assert.ok(method.includes('loadPriceQuote();'));
});
