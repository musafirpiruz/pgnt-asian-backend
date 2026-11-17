'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDtOneProductDetail } = require('../dtone-product-detail-adapter');

const detail = {
  id: 12345,
  operator: { name: 'ATOMA Afghanistan', country: { iso_code: 'AFG' } },
  service: { name: 'Mobile', subservice: { id: 11, name: 'Airtime' } },
  type: 'FIXED_VALUE_RECHARGE',
  destination: { amount: 250, unit: 'AFN' },
  prices: { wholesale: { amount: 4.17, unit: 'EUR' }, retail: { amount: 4.64, unit: 'EUR' } },
};

test('maps known DT One detail fields without changing EUR or destination amounts', () => {
  const row = normalizeDtOneProductDetail(detail, '12345', { AFG: 'AF' });
  assert.equal(row.productId, '12345');
  assert.equal(row.country, 'AF');
  assert.equal(row.operator, 'ATOMA Afghanistan');
  assert.equal(row.service, 'Mobile');
  assert.equal(row.subservice, 'Airtime');
  assert.equal(row.productType, 'FIXED_VALUE_RECHARGE');
  assert.equal(row.destinationCurrency, 'AFN');
  assert.equal(row.destinationAmount, '250');
  assert.equal(row.wholesalePriceEur, '4.17');
  assert.equal(row.wholesalePriceCurrency, 'EUR');
  assert.equal(row.retailPriceEur, '4.64');
  assert.equal(row.retailPriceCurrency, 'EUR');
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
  const product = { ...detail, service: undefined, type: undefined };
  const row = normalizeDtOneProductDetail(product, 12345, { AFG: 'AF' });
  assert.equal(row.service, '');
  assert.equal(row.subservice, '');
  assert.equal(row.productType, '');
  assert.deepEqual(row.rawFieldAvailability, {
    service: false, subservice: false, productType: false,
    wholesalePriceCurrency: true, retailPriceCurrency: true,
  });
});


test('preserves ranged destination and EUR price values from DT One detail responses', () => {
  const ranged = {
    ...detail,
    type: 'RANGED_VALUE_RECHARGE',
    destination: { amount: '30 - 4000', unit: 'AFN' },
    prices: {
      wholesale: { amount: '0.5 - 66.33', unit: 'EUR' },
      retail: { amount: '0.56 - 73.7', unit: 'EUR' },
    },
  };
  const row = normalizeDtOneProductDetail(ranged, '12345', { AFG: 'AF' });
  assert.equal(row.destinationAmount, '30 - 4000');
  assert.equal(row.wholesalePriceEur, '0.5 - 66.33');
  assert.equal(row.retailPriceEur, '0.56 - 73.7');
  assert.equal(row.destinationCurrency, 'AFN');
});

test('preserves USD destination currency for fixed PIN/eSIM products while prices remain EUR', () => {
  const esim = {
    ...detail,
    id: 66482,
    operator: { name: 'eSIM Pakistan', country: { iso_code: 'PAK' } },
    service: { name: 'eSIM' },
    type: 'FIXED_VALUE_PIN_PURCHASE',
    destination: { amount: 1.69, unit: 'USD' },
    prices: {
      wholesale: { amount: 1.29, unit: 'EUR' },
      retail: { amount: 1.44, unit: 'EUR' },
    },
  };
  const row = normalizeDtOneProductDetail(esim, '66482', { PAK: 'PK' });
  assert.equal(row.country, 'PK');
  assert.equal(row.destinationCurrency, 'USD');
  assert.equal(row.destinationAmount, '1.69');
  assert.equal(row.wholesalePriceCurrency, 'EUR');
  assert.equal(row.retailPriceCurrency, 'EUR');
});
