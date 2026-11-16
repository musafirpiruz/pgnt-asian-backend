'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectFixedRechargeProduct } = require('../dtone-fixed-recharge');

function product(overrides = {}) {
  return {
    id: 7194,
    type: 'FIXED_VALUE_RECHARGE',
    service: { id: 1, name: 'Mobile' },
    subservice: { id: 11, name: 'Airtime' },
    operator: { id: 100, name: 'ATOMA', country: { iso_code: 'AFG' } },
    destination: { unit: 'AFN', amount: 115 },
    prices: {
      wholesale: { unit_type: 'CURRENCY', unit: 'EUR', amount: 1.89 },
      retail: { unit_type: 'CURRENCY', unit: 'EUR', amount: 2.10 },
    },
    ...overrides,
  };
}

test('accepts only a fixed Mobile Airtime recharge with EUR prices and a 75–3000 integer amount', () => {
  const result = inspectFixedRechargeProduct(product(), 'AFN');
  assert.equal(result.eligible, true);
  assert.equal(result.operator, 'ATOMA');
  assert.equal(result.amount, 115);
  assert.equal(result.currency, 'AFN');
  assert.equal(result.wholesaleCents, 189);
  assert.equal(result.retailCents, 210);
});

test('rejects PIN, ranged and payment product types from the fixed recharge catalog', () => {
  for (const type of ['FIXED_VALUE_PIN_PURCHASE', 'RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT']) {
    const result = inspectFixedRechargeProduct(product({ type }), 'AFN');
    assert.equal(result.eligible, false, type);
  }
});

test('rejects non-Mobile products and explicitly non-Airtime Mobile subservices', () => {
  assert.equal(inspectFixedRechargeProduct(product({ service: { id: 3, name: 'Utilities' } }), 'AFN').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({ subservice: { id: 12, name: 'Data' } }), 'AFN').eligible, false);
});

test('rejects amounts below 75, above 3000, fractional and missing', () => {
  for (const amount of [74, 3001, 75.5, null, undefined]) {
    const result = inspectFixedRechargeProduct(product({
      destination: { unit: 'AFN', amount },
    }), 'AFN');
    assert.equal(result.eligible, false, String(amount));
  }
});

test('rejects country currency mismatch and prices not explicitly denominated in EUR', () => {
  assert.equal(inspectFixedRechargeProduct(product(), 'PKR').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({
    prices: {
      wholesale: { unit: 'USD', amount: 1.89 },
      retail: { unit: 'EUR', amount: 2.10 },
    },
  }), 'AFN').eligible, false);
});

test('rejects missing or inconsistent EUR prices and missing operator identity', () => {
  assert.equal(inspectFixedRechargeProduct(product({
    prices: {
      wholesale: { unit: 'EUR', amount: 2.10 },
      retail: { unit: 'EUR', amount: 1.89 },
    },
  }), 'AFN').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({
    operator: { id: 100, name: ' ' },
  }), 'AFN').eligible, false);
});
