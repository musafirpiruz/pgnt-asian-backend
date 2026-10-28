'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = server.indexOf('function calculateFinalPrice(product, pricing) {');
const end = server.indexOf('\n\n// Get a quote using server-side product and pricing data.', start);
assert.notEqual(start, -1, 'calculateFinalPrice must exist');
assert.ok(end > start, 'calculateFinalPrice source must have a clear boundary');

const functionSource = server.slice(start, end);
const calculateFinalPrice = vm.runInNewContext(
  '(' + functionSource + ')',
  {
    requirePositiveInteger(value, label) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(label);
      return value;
    },
    requireNonNegativeInteger(value, label) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(label);
      return value;
    },
    formatEuro(cents) {
      return '€' + (cents / 100).toFixed(2);
    },
  }
);

test('gross-up covers wholesale, app fee, and rounded Stripe fee without a one-cent shortfall', () => {
  const result = calculateFinalPrice(
    { wholesalePriceCents: 189 },
    {
      feeCents: 49,
      bonusPercent: 0,
      stripeFeePercent: 1.5,
      stripeFixedFeeCents: 25,
    }
  );

  assert.equal(result.finalPriceCents, 268);
  assert.equal(result.estimatedStripeFeeCents, 30);
  assert.ok(
    result.finalPriceCents - result.estimatedStripeFeeCents >= result.basePriceCents + result.feeCents,
    'net after rounded Stripe fee must preserve wholesale plus app fee'
  );
});

test('DT One wholesale of €1.91 with €0.49 app fee prices to €2.70 at current Stripe fee settings', () => {
  const result = calculateFinalPrice(
    { wholesalePriceCents: 191 },
    {
      feeCents: 49,
      bonusPercent: 0,
      stripeFeePercent: 1.5,
      stripeFixedFeeCents: 25,
    }
  );

  assert.equal(result.finalPriceCents, 270);
  assert.equal(result.estimatedStripeFeeCents, 30);
  assert.ok(
    result.finalPriceCents - result.estimatedStripeFeeCents >= result.basePriceCents + result.feeCents,
    'net after rounded Stripe fee must preserve the €1.91 wholesale cost plus €0.49 app fee'
  );
});

test('price remains unchanged when Stripe fees are zero and no extra gross-up is needed', () => {
  const result = calculateFinalPrice(
    { wholesalePriceCents: 189 },
    {
      feeCents: 49,
      bonusPercent: 0,
      stripeFeePercent: 0,
      stripeFixedFeeCents: 0,
    }
  );

  assert.equal(result.finalPriceCents, 238);
  assert.equal(result.estimatedStripeFeeCents, 0);
});
