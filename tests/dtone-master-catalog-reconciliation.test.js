'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWorkbookRow, compareWorkbookProduct, reconcileWorkbook } = require('../dtone-master-catalog-reconciliation');

const workbook = {
  'PRODUCT ID': 12345, 'PRODUCT NAME': 'Test topup',
  'OPERATOR COUNTRY': 'Afghanistan', 'OPERATOR NAME': 'ATOMA Afghanistan',
  SERVICE: 'Airtime', SUBSERVICE: '', 'PRODUCT TYPE': 'FIXED_VALUE_RECHARGE',
  'DESTINATION CURRENCY': 'AFN', 'DESTINATION AMOUNT': 250,
  'WHOLESALE PRICE (EUR)': 4.17, 'RETAIL PRICE (EUR)': 4.64,
};
const provider = {
  id: 12345, country: 'AF', operator: 'ATOMA Afghanistan',
  service: 'Airtime', subservice: '', productType: 'FIXED_VALUE_RECHARGE',
  destinationCurrency: 'AFN', destinationAmount: 250,
  wholesalePriceEur: 4.170, retailPriceEur: 4.640,
};

test('normalizes the official workbook column names and preserves empty subservice', () => {
  const row = normalizeWorkbookRow(workbook);
  assert.equal(row.country, 'AF');
  assert.equal(row.subservice, '');
  assert.equal(row.productId, '12345');
});

test('matches prices at EUR-cent precision', () => {
  assert.equal(compareWorkbookProduct(workbook, provider).status, 'MATCHED');
});

test('detects a wholesale price mismatch', () => {
  const result = compareWorkbookProduct(workbook, { ...provider, wholesalePriceEur: 4.18 });
  assert.equal(result.status, 'MISMATCH');
  assert.deepEqual(result.differences, ['wholesalePriceEur']);
});

test('marks absent provider product and excludes it from import candidates', () => {
  const result = reconcileWorkbook([workbook], []);
  assert.equal(result.counts.MISSING_AT_PROVIDER, 1);
  assert.deepEqual(result.importEligibleProductIds, []);
  assert.equal(result.safeToImport, false);
});

test('rejects duplicate workbook IDs and reports provider-only IDs', () => {
  assert.throws(() => reconcileWorkbook([workbook, workbook], []), /Duplicate workbook product ID/);
  const result = reconcileWorkbook([workbook], [provider, { ...provider, id: 99999 }]);
  assert.equal(result.providerOnlyCount, 1);
  assert.deepEqual(result.importEligibleProductIds, ['12345']);
});

test('flags duplicated provider IDs rather than choosing one', () => {
  const result = reconcileWorkbook([workbook], [provider, provider]);
  assert.equal(result.counts.PROVIDER_DUPLICATE_ID, 1);
  assert.deepEqual(result.importEligibleProductIds, []);
});
