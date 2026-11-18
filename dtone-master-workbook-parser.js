'use strict';

const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { normalizeWorkbookRow } = require('./dtone-master-catalog-reconciliation');

const EXPECTED_COUNTRY_COUNTS = Object.freeze({
  Afghanistan: 542,
  Pakistan: 783,
  India: 147,
  Bangladesh: 488,
});
const REQUIRED_HEADERS = Object.freeze([
  'PRODUCT ID',
  'PRODUCT NAME',
  'OPERATOR COUNTRY',
  'OPERATOR NAME',
  'SERVICE',
  'SUBSERVICE',
  'PRODUCT TYPE',
  'DESTINATION CURRENCY',
  'DESTINATION AMOUNT',
  'WHOLESALE PRICE (EUR)',
  'RETAIL PRICE (EUR)',
]);
const ACCEPTED_PRODUCT_TYPES = new Set([
  'FIXED_VALUE_RECHARGE',
  'RANGED_VALUE_RECHARGE',
  'FIXED_VALUE_PIN_PURCHASE',
  'RANGED_VALUE_PAYMENT',
]);

function cellScalar(value, rowNumber, header) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object' && value.text != null) return String(value.text);
  if (typeof value === 'object' && value.result != null) return value.result;
  throw new Error('Unsupported workbook cell value at row ' + rowNumber + ', column ' + header);
}

async function parseOfficialMasterWorkbook(buffer, sourceFileName) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100 || buffer.length > 2 * 1024 * 1024) {
    throw new Error('Workbook must be an XLSX file between 100 bytes and 2 MB.');
  }
  const filename = String(sourceFileName || '').trim();
  if (!/^PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES-1(?:\(\d+\))?\.xlsx$/i.test(filename)) {
    throw new Error('Upload the official PGNT_ASIAN_TOPUP_MASTER_CATALOG_ALL_COUNTRIES-1.xlsx workbook.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('All_Products');
  if (!sheet) throw new Error('The workbook must contain the All_Products sheet.');
  if (sheet.rowCount !== 1961) {
    throw new Error('All_Products must contain exactly 1 header row and 1,960 product rows.');
  }

  const headerRow = sheet.getRow(1);
  const headerValues = headerRow.values.slice(1).map((value) => String(value == null ? '' : value).trim());
  const headerIndexes = new Map(headerValues.map((header, index) => [header, index + 1]));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndexes.has(header));
  if (missingHeaders.length) {
    throw new Error('Workbook is missing required columns: ' + missingHeaders.join(', '));
  }

  const rows = [];
  const ids = new Set();
  const countryCounts = {};
  const productTypeCounts = {};

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const raw = {};
    for (const header of REQUIRED_HEADERS) {
      raw[header] = cellScalar(
        excelRow.getCell(headerIndexes.get(header)).value,
        rowNumber,
        header
      );
    }
    if (!String(raw['PRODUCT NAME'] || '').trim()) {
      throw new Error('Product name is missing at workbook row ' + rowNumber + '.');
    }

    const normalized = normalizeWorkbookRow(raw);
    if (ids.has(normalized.productId)) {
      throw new Error('Duplicate workbook Product ID: ' + normalized.productId);
    }
    ids.add(normalized.productId);

    if (!ACCEPTED_PRODUCT_TYPES.has(normalized.productType)) {
      throw new Error('Unsupported product type at row ' + rowNumber + ': ' + normalized.productType);
    }
    if (!/^[A-Z]{3}$/.test(normalized.destinationCurrency)) {
      throw new Error('Invalid destination currency at workbook row ' + rowNumber + '.');
    }

    const countryName = String(raw['OPERATOR COUNTRY']).trim();
    countryCounts[countryName] = (countryCounts[countryName] || 0) + 1;
    productTypeCounts[normalized.productType] = (productTypeCounts[normalized.productType] || 0) + 1;
    rows.push(normalized);
  }

  if (rows.length !== 1960) throw new Error('Exactly 1,960 unique workbook products are required.');
  for (const [country, expectedCount] of Object.entries(EXPECTED_COUNTRY_COUNTS)) {
    if (countryCounts[country] !== expectedCount) {
      throw new Error('Unexpected ' + country + ' product count; expected ' + expectedCount + '.');
    }
  }
  if (Object.keys(countryCounts).length !== 4) {
    throw new Error('Workbook must contain exactly the four supported countries.');
  }

  return Object.freeze({
    sourceFileName: filename,
    sourceSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    sheetName: 'All_Products',
    rowCount: rows.length,
    countryCounts,
    productTypeCounts,
    rows,
  });
}

module.exports = {
  parseOfficialMasterWorkbook,
  EXPECTED_COUNTRY_COUNTS,
  REQUIRED_HEADERS,
  ACCEPTED_PRODUCT_TYPES,
};
