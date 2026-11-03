'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('checkout validates product country, operator, and denomination against catalog data', () => {
  const routeStart = source.indexOf("app.post('/api/payments/checkout'");
  const routeEnd = source.indexOf("app.post('/api/", routeStart + 20);
  assert.ok(routeStart >= 0, 'checkout route exists');
  const route = source.slice(routeStart, routeEnd > routeStart ? routeEnd : undefined);
  const productLookup = route.indexOf('const product = await getProduct(');
  const countryCheck = route.indexOf("Product does not match selected country.");
  const operatorCheck = route.indexOf("Product does not match selected operator.");
  const amountCheck = route.indexOf("Product does not match selected amount.");
  const pricing = route.indexOf('const basePricing = await getPricingSettings');
  assert.ok(productLookup >= 0 && countryCheck > productLookup);
  assert.ok(operatorCheck > countryCheck && amountCheck > operatorCheck);
  assert.ok(pricing > amountCheck, 'all product selection checks occur before pricing and checkout');
});

test('checkout requires operator and amount even when a catalog product ID is supplied', () => {\n  const validationStart = source.indexOf('function validateCheckoutInput');\n  const validationEnd = source.indexOf('// =====================================================\\n// PART 3/8', validationStart);\n  const validation = source.slice(validationStart, validationEnd);\n  assert.match(validation, /!operator \\|\\| operator.length > 120/);\n  assert.match(validation, /!Number.isSafeInteger\\(amount\\) \\|\\| amount <= 0/);\n  assert.match(validation, /throw new Error\\('Select a valid operator and top-up amount\\.'\\)/);\n});\n\ntest('checkout compares selected operator and amount to server catalog values, not client prices', () => {
  assert.match(source, /product\.name\.trim\(\)\.toLowerCase\(\)\s*!==\s*input\.operator\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /product\.localAmount\s*!==\s*input\.amount/);
  assert.match(source, /throw new Error\('Product does not match selected operator\.'\)/);
  assert.match(source, /throw new Error\('Product does not match selected amount\.'\)/);
});
