'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('checkout validates selected country, legacy operator, and amount before pricing', () => {
  const routeStart = source.indexOf("app.post('/api/payments/checkout'");
  const routeEnd = source.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'checkout route exists');
  const route = source.slice(routeStart, routeEnd);
  const productLookup = route.indexOf('const product = await getProduct(');
  const countryCheck = route.indexOf("Product does not match selected country.");
  const operatorCheck = route.indexOf("Product does not match selected operator.");
  const amountCheck = route.indexOf("Product does not match selected amount.");
  const pricing = route.indexOf('const basePricing = await getPricingSettings');
  const stripeSession = route.indexOf('stripe.checkout.sessions.create');
  assert.ok(productLookup >= 0 && countryCheck > productLookup);
  assert.ok(operatorCheck > countryCheck && amountCheck > operatorCheck);
  assert.ok(pricing > amountCheck && stripeSession > pricing,
    'all catalog selection checks must finish before pricing and Stripe Checkout creation');
});

test('legacy catalog IDs cannot be paired with a different operator name', () => {
  assert.match(source,
    /if \(!verifiedOperator &&\s*product\.name\.trim\(\)\.toLowerCase\(\) !== input\.operator\.trim\(\)\.toLowerCase\(\)\)\s*\{\s*throw new Error\('Product does not match selected operator\.'\);/);
});

test('registry-backed checkout requires an active explicit operator-product mapping', () => {
  const lookupStart = source.indexOf('async function getProduct(');
  const lookupEnd = source.indexOf('// Calculate the final customer price.', lookupStart);
  const lookup = source.slice(lookupStart, lookupEnd);
  assert.match(lookup, /cop\.active = TRUE/);
  assert.match(lookup, /co\.active = TRUE/);
  assert.match(lookup, /cop\.provider_operator_id = co\.provider_operator_id/);
  assert.match(lookup, /cop\.provider_product_id = product_catalog\.product_id::text/);
  const checkoutStart = source.indexOf("app.post('/api/payments/checkout'");
  const checkoutEnd = source.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout'", checkoutStart);
  const checkout = source.slice(checkoutStart, checkoutEnd);
  assert.match(checkout, /getVerifiedCountryOperator\(/);
  assert.match(checkout, /operatorKey: verifiedOperator \? input\.operatorKey : null/);
});

test('catalog ID cannot bypass the selected denomination even for registry-backed operators', () => {
  assert.match(source,
    /if \(product\.localAmount !== input\.amount\)\s*\{\s*throw new Error\('Product does not match selected amount\.'\);/);
});
