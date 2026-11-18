'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  parseOfficialMasterWorkbook,
  REQUIRED_HEADERS,
} = require('../dtone-master-workbook-parser');

const SOURCE_NAME = 'PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES-1.xlsx';
const countryRows = [
  ...Array(542).fill('Afghanistan'),
  ...Array(783).fill('Pakistan'),
  ...Array(147).fill('India'),
  ...Array(488).fill('Bangladesh'),
];

async function makeWorkbook({ duplicateId = false, includeRangedPin = false } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('All_Products');
  sheet.addRow(REQUIRED_HEADERS);
  for (let index = 0; index < 1960; index += 1) {
    let productType = 'FIXED_VALUE_RECHARGE';
    if (index >= 1929 && index < 1943) productType = 'RANGED_VALUE_RECHARGE';
    else if (index >= 1943 && index < 1957) productType = 'FIXED_VALUE_PIN_PURCHASE';
    else if (index >= 1957) productType = 'RANGED_VALUE_PAYMENT';
    if (includeRangedPin && index === 0) productType = 'RANGED_VALUE_PIN_PURCHASE';

    const country = countryRows[index];
    const currency = { Afghanistan: 'AFN', Pakistan: 'PKR', India: 'INR', Bangladesh: 'BDT' }[country];
    const destinationCurrency = ['FIXED_VALUE_PIN_PURCHASE', 'RANGED_VALUE_PIN_PURCHASE'].includes(productType) ? 'USD' : currency;
    const destinationAmount = ['RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT', 'RANGED_VALUE_PIN_PURCHASE'].includes(productType)
      ? '30 - 4000'
      : productType === 'FIXED_VALUE_PIN_PURCHASE' ? 1.69 : 100;
    const wholesale = ['RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT', 'RANGED_VALUE_PIN_PURCHASE'].includes(productType)
      ? '0.5 - 66.33'
      : productType === 'FIXED_VALUE_PIN_PURCHASE' ? 1.29 : 0.5;
    const retail = ['RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT', 'RANGED_VALUE_PIN_PURCHASE'].includes(productType)
      ? '0.56 - 73.7'
      : productType === 'FIXED_VALUE_PIN_PURCHASE' ? 1.44 : 0.6;
    const productId = duplicateId && index === 1 ? 100000 : 100000 + index;
    sheet.addRow([
      productId,
      'Test product ' + index,
      country,
      'Test operator',
      productType === 'FIXED_VALUE_PIN_PURCHASE' ? 'eSIM' : 'Mobile',
      '',
      productType,
      destinationCurrency,
      destinationAmount,
      wholesale,
      retail,
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('parses the 1,960-row workbook with all four country counts and all product types', async () => {
  const buffer = await makeWorkbook();
  const parsed = await parseOfficialMasterWorkbook(buffer, SOURCE_NAME);
  assert.equal(parsed.rowCount, 1960);
  assert.deepEqual(parsed.countryCounts, {
    Afghanistan: 542,
    Pakistan: 783,
    India: 147,
    Bangladesh: 488,
  });
  assert.deepEqual(parsed.productTypeCounts, {
    FIXED_VALUE_RECHARGE: 1929,
    RANGED_VALUE_RECHARGE: 14,
    FIXED_VALUE_PIN_PURCHASE: 14,
    RANGED_VALUE_PAYMENT: 3,
  });
  assert.equal(parsed.rows[1929].destinationAmount, '30 - 4000');
  assert.equal(parsed.rows[1943].destinationCurrency, 'USD');
  assert.match(parsed.sourceSha256, /^[a-f0-9]{64}$/);
});

test('accepts RANGED_VALUE_PIN_PURCHASE as the fifth official provider enum', async () => {
  const parsed = await parseOfficialMasterWorkbook(
    await makeWorkbook({ includeRangedPin: true }),
    SOURCE_NAME
  );
  assert.equal(parsed.rows[0].productType, 'RANGED_VALUE_PIN_PURCHASE');
  assert.equal(parsed.rows[0].destinationCurrency, 'USD');
  assert.equal(parsed.productTypeCounts.RANGED_VALUE_PIN_PURCHASE, 1);
  assert.equal(parsed.productTypeCounts.FIXED_VALUE_RECHARGE, 1928);
});

test('rejects duplicate Product IDs before staging', async () => {
  const buffer = await makeWorkbook({ duplicateId: true });
  await assert.rejects(
    () => parseOfficialMasterWorkbook(buffer, SOURCE_NAME),
    /Duplicate workbook Product ID/
  );
});

test('rejects an unrecognized workbook filename', async () => {
  const buffer = await makeWorkbook();
  await assert.rejects(
    () => parseOfficialMasterWorkbook(buffer, 'other-catalog.xlsx'),
    /official PGNT/
  );
});
