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
  wholesalePriceEur: 4.170, wholesalePriceCurrency: 'EUR',
  retailPriceEur: 4.640, retailPriceCurrency: 'EUR',
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

test('rejects provider prices returned in a currency other than EUR', () => {
  const result = compareWorkbookProduct(workbook, {
    ...provider, wholesalePriceCurrency: 'USD',
  });
  assert.equal(result.status, 'MISMATCH');
  assert.deepEqual(result.differences, ['wholesalePriceCurrency']);
});


test('matches ranged recharge amounts and EUR price ranges without coercing them to fixed values', () => {
  const rangedWorkbook = {
    ...workbook,
    'PRODUCT ID': 11899,
    'PRODUCT NAME': 'Open_Range',
    SERVICE: 'Mobile',
    SUBSERVICE: 'Airtime',
    'PRODUCT TYPE': 'RANGED_VALUE_RECHARGE',
    'DESTINATION AMOUNT': '30 - 4000',
    'WHOLESALE PRICE (EUR)': '0.5 - 66.33',
    'RETAIL PRICE (EUR)': '0.56 - 73.7',
  };
  const rangedProvider = {
    ...provider,
    id: 11899,
    service: 'Mobile',
    subservice: 'Airtime',
    productType: 'RANGED_VALUE_RECHARGE',
    destinationAmount: '30–4000',
    wholesalePriceEur: '0.50 - 66.330',
    retailPriceEur: '0.560 to 73.700',
  };
  assert.equal(compareWorkbookProduct(rangedWorkbook, rangedProvider).status, 'MATCHED');
});

test('reports a mismatch when one endpoint of a provider range differs', () => {
  const rangedWorkbook = {
    ...workbook,
    'PRODUCT TYPE': 'RANGED_VALUE_RECHARGE',
    'DESTINATION AMOUNT': '30 - 4000',
    'WHOLESALE PRICE (EUR)': '0.5 - 66.33',
    'RETAIL PRICE (EUR)': '0.56 - 73.7',
  };
  const rangedProvider = {
    ...provider,
    productType: 'RANGED_VALUE_RECHARGE',
    destinationAmount: '30 - 3999',
    wholesalePriceEur: '0.5 - 66.33',
    retailPriceEur: '0.56 - 73.7',
  };
  const result = compareWorkbookProduct(rangedWorkbook, rangedProvider);
  assert.equal(result.status, 'MISMATCH');
  assert.deepEqual(result.differences, ['destinationAmount']);
});

test('matches fixed PIN/eSIM products with USD destination value and EUR provider prices', () => {
  const esimWorkbook = {
    ...workbook,
    'PRODUCT ID': 66482,
    'PRODUCT NAME': '1 GB 7 days Pakistan',
    'OPERATOR COUNTRY': 'Pakistan',
    'OPERATOR NAME': 'eSIM Pakistan',
    SERVICE: 'Data',
    SUBSERVICE: 'eSIM',
    'PRODUCT TYPE': 'FIXED_VALUE_PIN_PURCHASE',
    'DESTINATION CURRENCY': 'USD',
    'DESTINATION AMOUNT': 1.69,
    'WHOLESALE PRICE (EUR)': 1.29,
    'RETAIL PRICE (EUR)': 1.44,
  };
  const esimProvider = {
    id: 66482,
    country: 'PK',
    operator: 'eSIM Pakistan',
    service: 'Data',
    subservice: 'eSIM',
    productType: 'FIXED_VALUE_PIN_PURCHASE',
    destinationCurrency: 'USD',
    destinationAmount: '1.690',
    wholesalePriceEur: '1.290',
    wholesalePriceCurrency: 'EUR',
    retailPriceEur: '1.440',
    retailPriceCurrency: 'EUR',
  };
  assert.equal(compareWorkbookProduct(esimWorkbook, esimProvider).status, 'MATCHED');
});

test('rejects descending or malformed numeric ranges', () => {
  assert.throws(() => normalizeWorkbookRow({
    ...workbook,
    'DESTINATION AMOUNT': '4000 - 30',
  }), /minimum must not exceed its maximum/);
  assert.throws(() => normalizeWorkbookRow({
    ...workbook,
    'WHOLESALE PRICE (EUR)': '0.5 - unknown',
  }), /positive number or numeric range/);
});
