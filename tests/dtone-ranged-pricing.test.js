'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRangedWholesalePrice, calculateRangedCustomerPrice } = require('../dtone-ranged-pricing');

function response(overrides = {}) {
  return {
    id: 123456789,
    external_id: 'PGNT-ORDER-1',
    product: { id: 98765 },
    status: { message: 'CREATED' },
    confirmation_expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    requested_values: {
      destination: { amount: 150, unit: 'AFN', unit_type: 'CURRENCY' },
    },
    prices: {
      wholesale: { amount: 1.891, fee: 0.009, unit: 'EUR', unit_type: 'CURRENCY' },
    },
    ...overrides,
  };
}

const expected = {
  externalId: 'PGNT-ORDER-1',
  productId: '98765',
  destinationAmount: 150,
  destinationCurrency: 'AFN',
  destinationUnitType: 'CURRENCY',
};

test('accepts a CREATED ranged quote with matching amount and explicit EUR wholesale price', () => {
  const result = parseRangedWholesalePrice(response(), expected);
  assert.equal(result.transactionId, '123456789');
  assert.equal(result.wholesaleTotalCents, 190);
  assert.equal(result.destinationAmount, 150);
  assert.equal(result.destinationCurrency, 'AFN');
  assert.equal(result.providerStatus, 'CREATED');
  assert.equal(result.autoConfirmed, false);
});

test('rejects non-EUR wholesale currency instead of guessing an FX conversion', () => {
  const value = response({
    prices: { wholesale: { amount: 2.1, fee: 0, unit: 'USD', unit_type: 'CURRENCY' } },
  });
  assert.throws(() => parseRangedWholesalePrice(value, expected), /explicitly quoted in EUR/);
});

test('uses verified product unit metadata when DT One omits unit_type in requested_values', () => {
  const value = response({
    requested_values: { destination: { amount: 150, unit: 'AFN' } },
  });
  const result = parseRangedWholesalePrice(value, expected);
  assert.equal(result.destinationCurrency, 'AFN');
});

test('rejects a mismatched destination amount or currency', () => {
  assert.throws(() => parseRangedWholesalePrice(response(), {
    ...expected, destinationAmount: 200,
  }), /destination amount or currency/);
  assert.throws(() => parseRangedWholesalePrice(response(), {
    ...expected, destinationCurrency: 'PKR',
  }), /destination amount or currency/);
});

test('rejects unexpected product, external ID, or non-CREATED status', () => {
  assert.throws(() => parseRangedWholesalePrice(response({ product: { id: 1 } }), expected), /identity/);
  assert.throws(() => parseRangedWholesalePrice(response({ external_id: 'OTHER' }), expected), /identity/);
  assert.throws(() => parseRangedWholesalePrice(response({ status: { message: 'CONFIRMED' } }), expected), /identity/);
});

test('rejects missing wholesale fee evidence and expired confirmation windows', () => {
  assert.throws(() => parseRangedWholesalePrice(response({
    prices: { wholesale: { amount: 1.2, unit: 'EUR', unit_type: 'CURRENCY' } },
  }), expected), /explicitly quoted in EUR/);
  assert.throws(() => parseRangedWholesalePrice(response({
    confirmation_expiration_date: new Date(Date.now() - 1000).toISOString(),
  }), expected), /confirmation expiry/);
});


test('grosses up ranged EUR wholesale quote for app fee and Stripe fees', () => {
  const result = calculateRangedCustomerPrice(190, {
    feeCents: 49,
    stripeFeePercent: 1.5,
    stripeFixedFeeCents: 25,
  });
  assert.equal(result.currency, 'EUR');
  assert.equal(result.wholesaleCostCents, 190);
  assert.equal(result.feeCents, 49);
  assert.equal(result.estimatedStripeFeeCents, 30);
  assert.equal(result.finalPriceCents, 269);
  assert.equal(result.netAfterStripeCents, 239);
});

test('rejects invalid or non-integer ranged pricing inputs', () => {
  assert.throws(() => calculateRangedCustomerPrice(0, {
    feeCents: 49, stripeFeePercent: 1.5, stripeFixedFeeCents: 25,
  }), /wholesale cost/);
  assert.throws(() => calculateRangedCustomerPrice(190, {
    feeCents: -1, stripeFeePercent: 1.5, stripeFixedFeeCents: 25,
  }), /settings are invalid/);
  assert.throws(() => calculateRangedCustomerPrice(190, {
    feeCents: 49, stripeFeePercent: 100, stripeFixedFeeCents: 25,
  }), /settings are invalid/);
});
