'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('checkout requires operator and amount even when a catalog product ID is supplied', () => {
  const start = source.indexOf('function validateCheckoutInput');
  assert.ok(start >= 0);
  const validation = source.slice(start, start + 2600);
  assert.ok(validation.includes('!operator || operator.length > 120'));
  assert.ok(validation.includes('!Number.isSafeInteger(amount) || amount <= 0'));
  assert.ok(validation.includes("throw new Error('Select a valid operator and top-up amount.')"));
});

test('checkout verifies catalog product country, operator, and denomination before pricing', () => {
  const start = source.indexOf("app.post('/api/payments/checkout'");
  assert.ok(start >= 0);
  const route = source.slice(start);
  const lookup = route.indexOf('const product = await getProduct(');
  const country = route.indexOf('Product does not match selected country.');
  const operator = route.indexOf('Product does not match selected operator.');
  const amount = route.indexOf('Product does not match selected amount.');
  const pricing = route.indexOf('const basePricing = await getPricingSettings');
  assert.ok(lookup >= 0 && country > lookup);
  assert.ok(operator > country);
  assert.ok(amount > operator);
  assert.ok(pricing > amount);
  assert.ok(route.includes("product.name.trim().toLowerCase() !== input.operator.trim().toLowerCase()"));
  assert.ok(route.includes("product.localAmount !== input.amount"));
});
