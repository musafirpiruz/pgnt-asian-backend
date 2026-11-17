'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDtOneProductDetail } = require('../dtone-product-detail-adapter');

const detail = {
  id: 12345,
  operator: { name: 'ATOMA Afghanistan', country: { iso_code: 'AFG' } },
  service: { name: 'Airtime' },
  subservice: null,
  product_type: 'FIXED_VALUE_RECHARGE',
  destination: { amount: 250, unit: 'AFN' },
  prices: { wholesale: { amount: 4.17 }, retail: { amount: 4.64 } },
};

test('maps known DT One detail fields without changing EUR or destination amounts', () => {
  const row = normalizeDtOneProductDetail(detail, '12345', { AFG: 'AF' });
  assert.equal(row.productId, '12345');
  assert.equal(row.country, 'AF');
  assert.equal(row.operator, 'ATOMA Afghanistan');
  assert.equal(row.service, 'Airtime');
  assert.equal(row.subservice, '');
  assert.equal(row.productType, 'FIXED_VALUE_RECHARGE');
  assert.equal(row.destinationCurrency, 'AFN');
  assert.equal(row.destinationAmount, '250');
  assert.equal(row.wholesalePriceEur, '4.17');
  assert.equal(row.retailPriceEur, '4.64');
});

test('supports the existing benefits amount fallback used by catalog sync', () => {
  const product = {
    ...detail,
    destination: undefined,
    benefits: [{ amount: { base: 100, unit: 'PKR' } }],
  };
  const row = normalizeDtOneProductDetail(product, 12345, { AFG: 'AF' });
  assert.equal(row.destinationAmount, '100');
  assert.equal(row.destinationCurrency, 'PKR');
});

test('rejects a detail response whose ID differs from the requested workbook ID', () => {
  assert.throws(
    () => normalizeDtOneProductDetail(detail, '7194', { AFG: 'AF' }),
    /does not match/
  );
});

test('does not invent unavailable provider classification fields', () => {
  const product = { ...detail, service: undefined, subservice: undefined, product_type: undefined };
  const row = normalizeDtOneProductDetail(product, 12345, { AFG: 'AF' });
  assert.equal(row.service, '');
  assert.equal(row.subservice, '');
  assert.equal(row.productType, '');
  assert.deepEqual(row.rawFieldAvailability, {
    service: false, subservice: false, productType: false,
  });
});
