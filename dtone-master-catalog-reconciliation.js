'use strict';

// Deterministic comparison core for the official DT One master workbook.
// This module performs no network requests, DB writes, payments, or activation.
// Provider API responses must first be mapped into the normalized shape below.
const COUNTRY_CODES = Object.freeze({ Afghanistan: 'AF', Pakistan: 'PK', India: 'IN', Bangladesh: 'BD' });
const REQUIRED_FIELDS = Object.freeze([
  'productId', 'country', 'operator', 'service', 'productType',
  'destinationCurrency', 'destinationAmount', 'wholesalePriceEur', 'retailPriceEur',
]);

function text(value) {
  return value == null ? '' : String(value).trim();
}
function numericParts(value, field) {
  const raw = text(value).replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  const numeric = '[0-9]+(?:\\.[0-9]+)?';
  const range = new RegExp('^(' + numeric + ')\\s*(?:-|–|—|to)\\s*(' + numeric + ')
function normalizeWorkbookRow(row) {
  if (!row || typeof row !== 'object') throw new Error('Workbook row must be an object');
  const countryRaw = text(row.country || row.operatorCountry || row['OPERATOR COUNTRY']);
  const country = COUNTRY_CODES[countryRaw] || countryRaw.toUpperCase();
  const normalized = {
    productId: text(row.productId || row['PRODUCT ID']),
    productName: text(row.productName || row['PRODUCT NAME']),
    country,
    operator: text(row.operator || row['OPERATOR NAME']),
    service: text(row.service || row.SERVICE),
    subservice: text(row.subservice || row.SUBSERVICE),
    productType: text(row.productType || row['PRODUCT TYPE']).toUpperCase(),
    destinationCurrency: text(row.destinationCurrency || row['DESTINATION CURRENCY']).toUpperCase(),
    destinationAmount: text(row.destinationAmount || row['DESTINATION AMOUNT']),
    wholesalePriceEur: text(row.wholesalePriceEur || row['WHOLESALE PRICE (EUR)']),
    wholesalePriceCurrency: 'EUR',
    retailPriceEur: text(row.retailPriceEur || row['RETAIL PRICE (EUR)']),
    retailPriceCurrency: 'EUR',
  };
  const missing = REQUIRED_FIELDS.filter((field) => !normalized[field]);
  if (missing.length) throw new Error('Missing required workbook fields: ' + missing.join(', '));
  if (!/^[0-9]+$/.test(normalized.productId)) throw new Error('productId must contain digits only');
  canonicalNumeric(normalized.destinationAmount, 'destinationAmount');
  moneyCents(normalized.wholesalePriceEur, 'wholesalePriceEur');
  moneyCents(normalized.retailPriceEur, 'retailPriceEur');
  return Object.freeze(normalized);
}
function compareWorkbookProduct(expectedInput, providerInput) {
  const expected = normalizeWorkbookRow(expectedInput);
  if (!providerInput) return { productId: expected.productId, status: 'MISSING_AT_PROVIDER', differences: ['provider product not found'] };
  const provider = {
    productId: text(providerInput.productId || providerInput.id),
    country: text(providerInput.country).toUpperCase(),
    operator: text(providerInput.operator),
    service: text(providerInput.service),
    subservice: text(providerInput.subservice),
    productType: text(providerInput.productType).toUpperCase(),
    destinationCurrency: text(providerInput.destinationCurrency).toUpperCase(),
    destinationAmount: text(providerInput.destinationAmount),
    wholesalePriceEur: text(providerInput.wholesalePriceEur),
    wholesalePriceCurrency: text(providerInput.wholesalePriceCurrency).toUpperCase(),
    retailPriceEur: text(providerInput.retailPriceEur),
    retailPriceCurrency: text(providerInput.retailPriceCurrency).toUpperCase(),
  };
  const differences = [];
  const compareText = ['productId','country','operator','service','subservice','productType','destinationCurrency','wholesalePriceCurrency','retailPriceCurrency'];
  for (const field of compareText) {
    if (expected[field] !== provider[field]) differences.push(field);
  }
  for (const field of ['destinationAmount']) {
    try {
      if (canonicalNumeric(expected[field], field) !== canonicalNumeric(provider[field], field)) differences.push(field);
    } catch (_) { differences.push(field); }
  }
  for (const field of ['wholesalePriceEur','retailPriceEur']) {
    try { if (moneyCents(expected[field], field) !== moneyCents(provider[field], field)) differences.push(field); }
    catch (_) { differences.push(field); }
  }
  return {
    productId: expected.productId,
    status: differences.length ? 'MISMATCH' : 'MATCHED',
    differences,
  };
}
function reconcileWorkbook(rows, providerProducts) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Workbook rows must be a non-empty array');
  if (!Array.isArray(providerProducts)) throw new Error('Provider products must be an array');
  const expectedRows = rows.map(normalizeWorkbookRow);
  const workbookIds = new Set();
  for (const row of expectedRows) {
    if (workbookIds.has(row.productId)) throw new Error('Duplicate workbook product ID: ' + row.productId);
    workbookIds.add(row.productId);
  }
  const providerById = new Map();
  const duplicateProviderIds = new Set();
  for (const product of providerProducts) {
    const id = text(product && (product.productId || product.id));
    if (!id) continue;
    if (providerById.has(id)) duplicateProviderIds.add(id);
    else providerById.set(id, product);
  }
  const results = expectedRows.map((row) => {
    if (duplicateProviderIds.has(row.productId)) {
      return { productId: row.productId, status: 'PROVIDER_DUPLICATE_ID', differences: ['duplicate provider product ID'] };
    }
    return compareWorkbookProduct(row, providerById.get(row.productId));
  });
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const providerOnlyIds = [...providerById.keys()].filter((id) => !workbookIds.has(id));
  return Object.freeze({
    totalWorkbookRows: expectedRows.length,
    counts,
    providerOnlyCount: providerOnlyIds.length,
    providerOnlyIds,
    importEligibleProductIds: results.filter((r) => r.status === 'MATCHED').map((r) => r.productId),
    results,
    safeToImport: false, // This core intentionally never authorizes DB import.
  });
}
module.exports = { normalizeWorkbookRow, compareWorkbookProduct, reconcileWorkbook, moneyCents };
, 'i');
  const match = raw.match(range);
  const values = match ? [Number(match[1]), Number(match[2])] : (
    new RegExp('^' + numeric + '
function normalizeWorkbookRow(row) {
  if (!row || typeof row !== 'object') throw new Error('Workbook row must be an object');
  const countryRaw = text(row.country || row.operatorCountry || row['OPERATOR COUNTRY']);
  const country = COUNTRY_CODES[countryRaw] || countryRaw.toUpperCase();
  const normalized = {
    productId: text(row.productId || row['PRODUCT ID']),
    productName: text(row.productName || row['PRODUCT NAME']),
    country,
    operator: text(row.operator || row['OPERATOR NAME']),
    service: text(row.service || row.SERVICE),
    subservice: text(row.subservice || row.SUBSERVICE),
    productType: text(row.productType || row['PRODUCT TYPE']).toUpperCase(),
    destinationCurrency: text(row.destinationCurrency || row['DESTINATION CURRENCY']).toUpperCase(),
    destinationAmount: text(row.destinationAmount || row['DESTINATION AMOUNT']),
    wholesalePriceEur: text(row.wholesalePriceEur || row['WHOLESALE PRICE (EUR)']),
    wholesalePriceCurrency: 'EUR',
    retailPriceEur: text(row.retailPriceEur || row['RETAIL PRICE (EUR)']),
    retailPriceCurrency: 'EUR',
  };
  const missing = REQUIRED_FIELDS.filter((field) => !normalized[field]);
  if (missing.length) throw new Error('Missing required workbook fields: ' + missing.join(', '));
  if (!/^[0-9]+$/.test(normalized.productId)) throw new Error('productId must contain digits only');
  decimal(normalized.destinationAmount, 'destinationAmount');
  moneyCents(normalized.wholesalePriceEur, 'wholesalePriceEur');
  moneyCents(normalized.retailPriceEur, 'retailPriceEur');
  return Object.freeze(normalized);
}
function compareWorkbookProduct(expectedInput, providerInput) {
  const expected = normalizeWorkbookRow(expectedInput);
  if (!providerInput) return { productId: expected.productId, status: 'MISSING_AT_PROVIDER', differences: ['provider product not found'] };
  const provider = {
    productId: text(providerInput.productId || providerInput.id),
    country: text(providerInput.country).toUpperCase(),
    operator: text(providerInput.operator),
    service: text(providerInput.service),
    subservice: text(providerInput.subservice),
    productType: text(providerInput.productType).toUpperCase(),
    destinationCurrency: text(providerInput.destinationCurrency).toUpperCase(),
    destinationAmount: text(providerInput.destinationAmount),
    wholesalePriceEur: text(providerInput.wholesalePriceEur),
    wholesalePriceCurrency: text(providerInput.wholesalePriceCurrency).toUpperCase(),
    retailPriceEur: text(providerInput.retailPriceEur),
    retailPriceCurrency: text(providerInput.retailPriceCurrency).toUpperCase(),
  };
  const differences = [];
  const compareText = ['productId','country','operator','service','subservice','productType','destinationCurrency','wholesalePriceCurrency','retailPriceCurrency'];
  for (const field of compareText) {
    if (expected[field] !== provider[field]) differences.push(field);
  }
  for (const field of ['destinationAmount']) {
    try { if (decimal(expected[field], field) !== decimal(provider[field], field)) differences.push(field); }
    catch (_) { differences.push(field); }
  }
  for (const field of ['wholesalePriceEur','retailPriceEur']) {
    try { if (moneyCents(expected[field], field) !== moneyCents(provider[field], field)) differences.push(field); }
    catch (_) { differences.push(field); }
  }
  return {
    productId: expected.productId,
    status: differences.length ? 'MISMATCH' : 'MATCHED',
    differences,
  };
}
function reconcileWorkbook(rows, providerProducts) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Workbook rows must be a non-empty array');
  if (!Array.isArray(providerProducts)) throw new Error('Provider products must be an array');
  const expectedRows = rows.map(normalizeWorkbookRow);
  const workbookIds = new Set();
  for (const row of expectedRows) {
    if (workbookIds.has(row.productId)) throw new Error('Duplicate workbook product ID: ' + row.productId);
    workbookIds.add(row.productId);
  }
  const providerById = new Map();
  const duplicateProviderIds = new Set();
  for (const product of providerProducts) {
    const id = text(product && (product.productId || product.id));
    if (!id) continue;
    if (providerById.has(id)) duplicateProviderIds.add(id);
    else providerById.set(id, product);
  }
  const results = expectedRows.map((row) => {
    if (duplicateProviderIds.has(row.productId)) {
      return { productId: row.productId, status: 'PROVIDER_DUPLICATE_ID', differences: ['duplicate provider product ID'] };
    }
    return compareWorkbookProduct(row, providerById.get(row.productId));
  });
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const providerOnlyIds = [...providerById.keys()].filter((id) => !workbookIds.has(id));
  return Object.freeze({
    totalWorkbookRows: expectedRows.length,
    counts,
    providerOnlyCount: providerOnlyIds.length,
    providerOnlyIds,
    importEligibleProductIds: results.filter((r) => r.status === 'MATCHED').map((r) => r.productId),
    results,
    safeToImport: false, // This core intentionally never authorizes DB import.
  });
}
module.exports = { normalizeWorkbookRow, compareWorkbookProduct, reconcileWorkbook, moneyCents };
).test(raw) ? [Number(raw)] : []
  );
  if (!values.length || values.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(field + ' must be a positive number or an ascending numeric range');
  }
  if (values.length === 2 && values[0] > values[1]) {
    throw new Error(field + ' range minimum must not exceed its maximum');
  }
  return values;
}
function canonicalNumeric(value, field) {
  return numericParts(value, field).map((n) => Number(n.toFixed(8)).toString()).join('-');
}
function moneyCents(value, field) {
  return numericParts(value, field)
    .map((n) => Math.round((n + Number.EPSILON) * 100))
    .join('-');
}
function normalizeWorkbookRow(row) {
  if (!row || typeof row !== 'object') throw new Error('Workbook row must be an object');
  const countryRaw = text(row.country || row.operatorCountry || row['OPERATOR COUNTRY']);
  const country = COUNTRY_CODES[countryRaw] || countryRaw.toUpperCase();
  const normalized = {
    productId: text(row.productId || row['PRODUCT ID']),
    productName: text(row.productName || row['PRODUCT NAME']),
    country,
    operator: text(row.operator || row['OPERATOR NAME']),
    service: text(row.service || row.SERVICE),
    subservice: text(row.subservice || row.SUBSERVICE),
    productType: text(row.productType || row['PRODUCT TYPE']).toUpperCase(),
    destinationCurrency: text(row.destinationCurrency || row['DESTINATION CURRENCY']).toUpperCase(),
    destinationAmount: text(row.destinationAmount || row['DESTINATION AMOUNT']),
    wholesalePriceEur: text(row.wholesalePriceEur || row['WHOLESALE PRICE (EUR)']),
    wholesalePriceCurrency: 'EUR',
    retailPriceEur: text(row.retailPriceEur || row['RETAIL PRICE (EUR)']),
    retailPriceCurrency: 'EUR',
  };
  const missing = REQUIRED_FIELDS.filter((field) => !normalized[field]);
  if (missing.length) throw new Error('Missing required workbook fields: ' + missing.join(', '));
  if (!/^[0-9]+$/.test(normalized.productId)) throw new Error('productId must contain digits only');
  decimal(normalized.destinationAmount, 'destinationAmount');
  moneyCents(normalized.wholesalePriceEur, 'wholesalePriceEur');
  moneyCents(normalized.retailPriceEur, 'retailPriceEur');
  return Object.freeze(normalized);
}
function compareWorkbookProduct(expectedInput, providerInput) {
  const expected = normalizeWorkbookRow(expectedInput);
  if (!providerInput) return { productId: expected.productId, status: 'MISSING_AT_PROVIDER', differences: ['provider product not found'] };
  const provider = {
    productId: text(providerInput.productId || providerInput.id),
    country: text(providerInput.country).toUpperCase(),
    operator: text(providerInput.operator),
    service: text(providerInput.service),
    subservice: text(providerInput.subservice),
    productType: text(providerInput.productType).toUpperCase(),
    destinationCurrency: text(providerInput.destinationCurrency).toUpperCase(),
    destinationAmount: text(providerInput.destinationAmount),
    wholesalePriceEur: text(providerInput.wholesalePriceEur),
    wholesalePriceCurrency: text(providerInput.wholesalePriceCurrency).toUpperCase(),
    retailPriceEur: text(providerInput.retailPriceEur),
    retailPriceCurrency: text(providerInput.retailPriceCurrency).toUpperCase(),
  };
  const differences = [];
  const compareText = ['productId','country','operator','service','subservice','productType','destinationCurrency','wholesalePriceCurrency','retailPriceCurrency'];
  for (const field of compareText) {
    if (expected[field] !== provider[field]) differences.push(field);
  }
  for (const field of ['destinationAmount']) {
    try { if (decimal(expected[field], field) !== decimal(provider[field], field)) differences.push(field); }
    catch (_) { differences.push(field); }
  }
  for (const field of ['wholesalePriceEur','retailPriceEur']) {
    try { if (moneyCents(expected[field], field) !== moneyCents(provider[field], field)) differences.push(field); }
    catch (_) { differences.push(field); }
  }
  return {
    productId: expected.productId,
    status: differences.length ? 'MISMATCH' : 'MATCHED',
    differences,
  };
}
function reconcileWorkbook(rows, providerProducts) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Workbook rows must be a non-empty array');
  if (!Array.isArray(providerProducts)) throw new Error('Provider products must be an array');
  const expectedRows = rows.map(normalizeWorkbookRow);
  const workbookIds = new Set();
  for (const row of expectedRows) {
    if (workbookIds.has(row.productId)) throw new Error('Duplicate workbook product ID: ' + row.productId);
    workbookIds.add(row.productId);
  }
  const providerById = new Map();
  const duplicateProviderIds = new Set();
  for (const product of providerProducts) {
    const id = text(product && (product.productId || product.id));
    if (!id) continue;
    if (providerById.has(id)) duplicateProviderIds.add(id);
    else providerById.set(id, product);
  }
  const results = expectedRows.map((row) => {
    if (duplicateProviderIds.has(row.productId)) {
      return { productId: row.productId, status: 'PROVIDER_DUPLICATE_ID', differences: ['duplicate provider product ID'] };
    }
    return compareWorkbookProduct(row, providerById.get(row.productId));
  });
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const providerOnlyIds = [...providerById.keys()].filter((id) => !workbookIds.has(id));
  return Object.freeze({
    totalWorkbookRows: expectedRows.length,
    counts,
    providerOnlyCount: providerOnlyIds.length,
    providerOnlyIds,
    importEligibleProductIds: results.filter((r) => r.status === 'MATCHED').map((r) => r.productId),
    results,
    safeToImport: false, // This core intentionally never authorizes DB import.
  });
}
module.exports = { normalizeWorkbookRow, compareWorkbookProduct, reconcileWorkbook, moneyCents };
