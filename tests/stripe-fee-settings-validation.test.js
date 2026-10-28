'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('function calculateFinalPrice(product, pricing) {');
const end = server.indexOf('// Get a quote using server-side product and pricing data.', start);
assert.notEqual(start, -1);
assert.ok(end > start);

const calculateFinalPrice = vm.runInNewContext('(' + server.slice(start, end) + ')', {
  requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(label);
    return value;
  },
  requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(label);
    return value;
  },
  formatEuro(cents) { return '€' + (cents / 100).toFixed(2); },
});

const product = { wholesalePriceCents: 189 };
const validPricing = {
  feeCents: 49, bonusPercent: 0,
  stripeFeePercent: 1.5, stripeFixedFeeCents: 25,
};

test('rejects Stripe fee percentages that are negative, non-finite, or at least 100%', () => {
  for (const stripeFeePercent of [-0.1, 100, 150, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => calculateFinalPrice(product, { ...validPricing, stripeFeePercent }),
      /Invalid Stripe fee percentage/
    );
  }
});

test('rejects missing, negative, fractional, or non-finite Stripe fixed fees', () => {
  for (const stripeFixedFeeCents of [undefined, -1, 1.5, NaN, Infinity]) {
    assert.throws(
      () => calculateFinalPrice(product, { ...validPricing, stripeFixedFeeCents }),
      /Stripe fixed fee/
    );
  }
});

test('keeps the current ATOMA quote unchanged for valid Stripe fee settings', () => {
  const quote = calculateFinalPrice(product, validPricing);
  assert.equal(quote.finalPriceCents, 268);
  assert.equal(quote.estimatedStripeFeeCents, 30);
  assert.equal(quote.stripeFixedFeeCents, 25);
});
