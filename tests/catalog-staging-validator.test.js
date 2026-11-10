'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCatalogRows } = require('../catalog-staging-validator');

function row(overrides = {}) {
  return {
    productId: 1001,
    country: 'AF',
    operator: 'ATOMA',
    destinationAmount: 100,
    destinationCurrency: 'AFN',
    productType: 'FIXED_VALUE_RECHARGE',
    wholesalePriceEur: 1.25,
    retailPriceEur: 1.49,
    ...overrides,
  };
}

test('validates all four destination markets and keeps every row inactive/unverified', () => {
  const result = validateCatalogRows([
    row(),
    row({ productId: 2001, country: 'PK', operator: 'Jazz', destinationAmount: 100, destinationCurrency: 'PKR' }),
    row({ productId: 3001, country: 'IN', operator: 'Airtel', destinationAmount: 100, destinationCurrency: 'INR' }),
    row({ productId: 4001, country: 'BD', operator: 'Robi', destinationAmount: 100, destinationCurrency: 'BDT' }),
  ]);
  assert.equal(result.totalRows, 4);
  assert.deepEqual(Object.keys(result.counts.byCountry).sort(), ['AF', 'BD', 'IN', 'PK']);
  assert.equal(result.status, 'STRUCTURE_VALID_PROVIDER_REVIEW_REQUIRED');
  assert.ok(result.rows.every((item) => item.active === false && item.providerVerified === false));
});

test('allows ranged products without fixed EUR prices but does not verify or activate them', () => {
  const result = validateCatalogRows([row({
    productType: 'RANGED_VALUE_RECHARGE',
    wholesalePriceEur: null,
    retailPriceEur: null,
  })]);
  assert.equal(result.counts.rangedRows, 1);
  assert.equal(result.rows[0].wholesalePriceEur, null);
  assert.equal(result.rows[0].active, false);
});

test('rejects destination currency mismatches', () => {
  assert.throws(() => validateCatalogRows([row({ destinationCurrency: 'USD' })]), /destination currency mismatch/);
});

test('rejects missing fixed-price wholesale or retail prices', () => {
  assert.throws(() => validateCatalogRows([row({ wholesalePriceEur: null })]), /wholesalePriceEur is required/);
});

test('rejects duplicate provider product IDs and duplicate destination keys', () => {
  assert.throws(() => validateCatalogRows([row(), row({ operator: 'Different operator' })]), /duplicate productId/);
  assert.throws(() => validateCatalogRows([row(), row({ productId: 1002 })]), /duplicate country\/operator\/amount\/currency/);
});

test('rejects retail prices below wholesale cost', () => {
  assert.throws(() => validateCatalogRows([row({ wholesalePriceEur: 2, retailPriceEur: 1.99 })]), /retailPriceEur cannot be below/);
});
