'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('checkout requires operator and amount even when a catalog product ID is supplied', () => {
  const start = source.indexOf('function validateCheckoutInput');
  const end = source.indexOf('// =====================================================\\n// PART 3/8', start);
  assert.ok(start >= 0 && end > start);
  const validation = source.slice(start, end);
  assert.match(validation, /!operator \\|\\| operator.length > 120/);
  assert.match(validation, /!Number.isSafeInteger\\(amount\\) \\|\\| amount <= 0/);
  assert.match(validation, /Select a valid operator and top-up amount/);
});

test('checkout verifies catalog product country, operator, and denomination before pricing', () => {
  const start = source.indexOf("app.post('/api/payments/checkout'");
  const end = source.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout'", start);
  assert.ok(start >= 0 && end > start);
  const route = source.slice(start, end);
  const lookup = route.indexOf('const product = await getProduct(');
  const country = route.indexOf('Product does not match selected country.');
  const operator = route.indexOf('Product does not match selected operator.');
  const amount = route.indexOf('Product does not match selected amount.');
  const pricing = route.indexOf('const basePricing = await getPricingSettings');
  assert.ok(lookup >= 0 && country > lookup);
  assert.ok(operator > country);
  assert.ok(amount > operator);
  assert.ok(pricing > amount, 'catalog selection is verified before pricing');
  assert.match(route, /product\\.name\\.trim\\(\\)\\.toLowerCase\\(\\) !== input\\.operator\\.trim\\(\\)\\.toLowerCase\\(\\)/);
  assert.match(route, /product\\.localAmount !== input\\.amount/);
});
