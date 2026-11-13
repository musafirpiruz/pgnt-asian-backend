'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('fixed-value top-ups are selected from the verified DT One catalog, not a customer-entered amount range', () => {
  assert.doesNotMatch(server, /const PGNT_(?:MIN|MAX)_AMOUNT/);
  const validatorStart = server.indexOf('function validateCheckoutInput(body)');
  const validatorEnd = server.indexOf('// =====================================================\n// PART 3/8', validatorStart);
  assert.ok(validatorStart >= 0 && validatorEnd > validatorStart);
  const validator = server.slice(validatorStart, validatorEnd);
  assert.match(validator, /body\.productId/);
  assert.doesNotMatch(validator, /body\.amount|body\.operatorKey|body\.operator/);
  assert.match(flutter, /buildVerifiedProductSelector\(\)/);
  assert.ok(!flutter.includes('Widget buildCustomAmountField()'));
});

test('quote and checkout both use the same exact internal catalog product identity', () => {
  const quoteStart = server.indexOf("app.get('/api/pricing/quote'");
  const quoteEnd = server.indexOf('// =====================================================\n// PART 4/8', quoteStart);
  const checkoutStart = server.indexOf("app.post('/api/payments/checkout'");
  const checkoutEnd = server.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout'", checkoutStart);
  assert.ok(quoteStart >= 0 && quoteEnd > quoteStart);
  assert.ok(checkoutStart >= 0 && checkoutEnd > checkoutStart);
  const quote = server.slice(quoteStart, quoteEnd);
  const checkout = server.slice(checkoutStart, checkoutEnd);
  assert.match(quote, /req\.query\.productId/);
  assert.match(quote, /getProduct\(client, productId, country/);
  assert.match(checkout, /input\.productId/);
  assert.doesNotMatch(checkout, /input\.amount|input\.operatorKey/);
});


test('verified catalog supports the requested 75 to 3000 destination amount range', () => {
  const productRouteStart = server.indexOf("app.get('/api/countries/:countryCode/operators/:operatorKey/products'");
  const productRouteEnd = server.indexOf("app.", productRouteStart + 40);
  assert.ok(productRouteStart >= 0 && productRouteEnd > productRouteStart);
  const productRoute = server.slice(productRouteStart, productRouteEnd);
  assert.match(productRoute, /p\.amount >= 75/);
  assert.match(productRoute, /p\.amount <= 3000/);
  assert.match(server, /localAmount < 75 \|\| localAmount > 3000/);
});
