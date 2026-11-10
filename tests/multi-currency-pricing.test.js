'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCustomerCharge } = require('../multi-currency-pricing');

test('grosses up EUR while preserving wholesale plus the exact app fee', () => {
  const result = calculateCustomerCharge({
    currency: 'EUR',
    wholesaleCostMinor: 189,
    appFeeMinor: 49,
    stripeFeePercent: 1.5,
    stripeFixedFeeMinor: 25,
  });
  assert.equal(result.currency, 'EUR');
  assert.equal(result.appFeeMinor, 49);
  assert.ok(result.estimatedNetAfterStripeMinor >= 238);
  assert.equal(result.estimatedNetAfterWholesaleMinor, 49);
});

test('supports the configured GBP and USD application fees independently', () => {
  for (const [currency, appFeeMinor] of [['GBP', 59], ['USD', 59]]) {
    const result = calculateCustomerCharge({
      currency,
      wholesaleCostMinor: 250,
      appFeeMinor,
      stripeFeePercent: 2.5,
      stripeFixedFeeMinor: 30,
    });
    assert.equal(result.currency, currency);
    assert.equal(result.appFeeMinor, 59);
    assert.ok(result.estimatedNetAfterStripeMinor >= 309);
    assert.equal(result.estimatedNetAfterWholesaleMinor, 59);
  }
});

test('does not accept invalid currencies, fractions, negative values or fee rates', () => {
  const base = {
    currency: 'EUR',
    wholesaleCostMinor: 200,
    appFeeMinor: 49,
    stripeFeePercent: 1.5,
    stripeFixedFeeMinor: 25,
  };
  assert.throws(() => calculateCustomerCharge({ ...base, currency: 'AFN' }));
  assert.throws(() => calculateCustomerCharge({ ...base, wholesaleCostMinor: 1.2 }));
  assert.throws(() => calculateCustomerCharge({ ...base, appFeeMinor: -1 }));
  assert.throws(() => calculateCustomerCharge({ ...base, stripeFeePercent: 100 }));
  assert.throws(() => calculateCustomerCharge({ ...base, stripeFixedFeeMinor: NaN }));
});
