'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('ranged product discovery is read-only and gated by the active product list', () => {
  const start = dart.indexOf('Future<void> loadPriceQuote()');
  const end = dart.indexOf('void selectCountry(', start);
  assert.ok(start >= 0 && end > start);
  const method = dart.slice(start, end);
  assert.match(method, /api\/ranged-products/);
  assert.match(method, /isRangedAvailable/);
  assert.match(method, /minAmount/);
  assert.match(method, /maxAmount/);
  assert.match(method, /increment/);
  assert.doesNotMatch(method, /api\/ranged-quotes/);
});

test('ranged quote is created only after explicit customer continuation', () => {
  const start = dart.indexOf('Future<void> startPayment()');
  const end = dart.indexOf('Widget buildHistory()', start);
  assert.ok(start >= 0 && end > start);
  const method = dart.slice(start, end);
  assert.match(method, /priceQuote\?\['isRangedAvailable'\] == true/);
  assert.match(method, /api\/ranged-quotes/);
  assert.match(method, /orderAccessToken/);
  assert.match(method, /rangedQuote/);
  assert.match(method, /api\/payments\/checkout/);
  assert.match(method, /_persistAccessTokens\(\)/);
});

test('ranged price preview does not pretend a fixed-product EUR price is valid', () => {
  assert.match(dart, /د تادیې مخکې تاییدېږي/);
  assert.match(dart, /د DT One وروستی عمده قیمت او د PGNT فیس به د تادیې له جوړولو مخکې تایید شي/);
});

test('fixed-product checkout path remains available alongside ranged checkout', () => {
  const start = dart.indexOf('Future<void> startPayment()');
  const end = dart.indexOf('Widget buildHistory()', start);
  const method = dart.slice(start, end);
  assert.match(method, /'operatorKey': selectedOperator!\.operatorKey!/);
  assert.match(method, /'currency': selectedCountry\.currency/);
  assert.match(method, /checkoutBody = \{/);
});
