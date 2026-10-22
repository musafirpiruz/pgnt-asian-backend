// Isolated regression tests for the real calculateFinalPrice function in server.js.
// No Stripe, DT One, database, or live transaction is used.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('function calculateFinalPrice(product, pricing) {');
const end = server.indexOf('\n}\n\n// Get a quote using server-side product and pricing data.', start);
assert.notEqual(start, -1, 'calculateFinalPrice must exist');
assert.ok(end > start, 'calculateFinalPrice function boundary must be found');
const functionSource = server.slice(start, end + 2);

function loadPricingFunction() {
  const context = {
    requirePositiveInteger(value, label) {
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid ${label}.`);
      return n;
    },
    requireNonNegativeInteger(value, label) {
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid ${label}.`);
      return n;
    },
    formatEuro(cents) {
      return `€${(cents / 100).toFixed(2)}`;
    },
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource}\nthis.calculateFinalPrice = calculateFinalPrice;`, context);
  return context.calculateFinalPrice;
}

test('calculates customer price from wholesale cost + app fee + estimated Stripe fees', () => {
  const calculateFinalPrice = loadPricingFunction();
  const result = calculateFinalPrice(
    { wholesalePriceCents: 191 },
    { feeCents: 79, bonusPercent: 0, stripeFeePercent: 1.5, stripeFixedFeeCents: 25 }
  );

  // ceil((191 + 79 + 25) / (1 - 0.015)) = 300 cents.
  assert.equal(result.basePriceCents, 191);
  assert.equal(result.feeCents, 79);
  assert.equal(result.finalPriceCents, 300);
  assert.equal(result.estimatedStripeFeeCents, 30);
  assert.equal(result.currency, 'EUR');
  assert.equal(result.formattedFinalPrice, '€3.00');
  assert.ok(result.finalPriceCents - result.estimatedStripeFeeCents >= 191 + 79);
});

test('fails closed when DT One wholesale cost is absent or invalid', () => {
  const calculateFinalPrice = loadPricingFunction();
  for (const wholesalePriceCents of [null, undefined, 0, -1, 'not-a-price']) {
    assert.throws(
      () => calculateFinalPrice(
        { wholesalePriceCents },
        { feeCents: 79, bonusPercent: 0, stripeFeePercent: 1.5, stripeFixedFeeCents: 25 }
      ),
      /wholesale price/
    );
  }
});

test('rejects invalid bonus percentages instead of silently accepting them', () => {
  const calculateFinalPrice = loadPricingFunction();
  for (const bonusPercent of [-0.1, 100.1, Number.NaN]) {
    assert.throws(
      () => calculateFinalPrice(
        { wholesalePriceCents: 191 },
        { feeCents: 79, bonusPercent, stripeFeePercent: 1.5, stripeFixedFeeCents: 25 }
      ),
      /bonus percentage/
    );
  }
});

test('does not use AFN reference FX rate to replace the verified wholesale cost', () => {
  const calculateFinalPrice = loadPricingFunction();
  const pricing = { feeCents: 79, bonusPercent: 0, stripeFeePercent: 1.5, stripeFixedFeeCents: 25, afnPerEur: 70 };
  const first = calculateFinalPrice({ wholesalePriceCents: 191 }, pricing);
  const second = calculateFinalPrice({ wholesalePriceCents: 191 }, { ...pricing, afnPerEur: 90 });
  assert.equal(first.finalPriceCents, second.finalPriceCents);
});
