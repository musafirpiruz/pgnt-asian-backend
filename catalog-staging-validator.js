'use strict';

// Offline-only catalogue validator. It never connects to PostgreSQL, DT One,
// Stripe, or the live service. Valid rows are returned inactive and unverified.
const COUNTRY_CURRENCY = Object.freeze({ AF: 'AFN', PK: 'PKR', IN: 'INR', BD: 'BDT' });
const FIXED_TYPES = new Set(['FIXED_VALUE_RECHARGE', 'FIXED_VALUE_PIN_PURCHASE']);
const RANGED_TYPES = new Set(['RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT']);

function parseRange(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error(field + ' is required');
  const text = String(value).trim();
  const parts = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:-|–|to)\s*([0-9]+(?:\.[0-9]+)?)$/i);
  if (parts) {
    const min = Number(parts[1]), max = Number(parts[2]);
    if (!(min > 0) || !(max >= min)) throw new Error(field + ' has an invalid range');
    return { min, max, display: text };
  }
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) throw new Error(field + ' must be positive or a valid min-max range');
  return { min: n, max: n, display: text };
}

function validateCatalogRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Catalog rows must be a non-empty array');
  const ids = new Set(), keyRows = new Map(), normalized = [], errors = [];
  rows.forEach((row, index) => {
    const prefix = 'row ' + (index + 1) + ': ';
    try {
      if (!row || typeof row !== 'object') throw new Error('row must be an object');
      const productId = Number(row.productId);
      if (!Number.isSafeInteger(productId) || productId <= 0) throw new Error('productId must be a positive safe integer');
      if (ids.has(productId)) throw new Error('duplicate productId ' + productId);
      ids.add(productId);
      const country = String(row.country || '').trim().toUpperCase();
      if (!Object.prototype.hasOwnProperty.call(COUNTRY_CURRENCY, country)) throw new Error('unsupported country ' + country);
      const currency = String(row.destinationCurrency || '').trim().toUpperCase();
      const operator = String(row.operator || '').trim();
      if (!operator) throw new Error('operator is required');
      const type = String(row.productType || '').trim().toUpperCase();
      if (!FIXED_TYPES.has(type) && !RANGED_TYPES.has(type)) throw new Error('unsupported productType ' + type);
      const service = String(row.service || '').trim().toLowerCase();
      const isEsimUsd = currency === 'USD' && service === 'esim' && type === 'FIXED_VALUE_PIN_PURCHASE';
      if (!isEsimUsd && currency !== COUNTRY_CURRENCY[country]) {
        throw new Error('destination currency mismatch for ' + country + '; expected ' + COUNTRY_CURRENCY[country] + ' (USD is only accepted for fixed eSIM PIN products)');
      }
      const amount = parseRange(row.destinationAmount, 'destinationAmount');
      const wholesale = parseRange(row.wholesalePriceEur, 'wholesalePriceEur');
      const retail = parseRange(row.retailPriceEur, 'retailPriceEur');
      if (retail.min < wholesale.min || retail.max < wholesale.max) throw new Error('retail EUR price range cannot be below wholesale EUR price range');
      // This is the legacy product_catalog natural key. Do not reject source
      // rows here: bundles/data packs can legitimately share a face amount.
      // Instead report the collision so schema and product selection can be
      // migrated before bulk import; never silently drop these products.
      const legacyKey = [country, operator.toLowerCase(), amount.display, currency].join('|');
      const group = keyRows.get(legacyKey) || [];
      group.push(productId);
      keyRows.set(legacyKey, group);
      normalized.push(Object.freeze({
        productId, country, operator, service: row.service || null,
        subservice: row.subservice || null, productName: row.productName || null,
        destinationAmount: amount.display, destinationCurrency: currency,
        productType: type, wholesalePriceEur: wholesale.display,
        retailPriceEur: retail.display,
        catalogClass: isEsimUsd ? 'ESIM_USD_PIN' : (RANGED_TYPES.has(type) ? 'RANGED_LOCAL_CURRENCY' : 'FIXED_LOCAL_CURRENCY'),
        providerVerified: false, active: false,
      }));
    } catch (error) { errors.push(prefix + error.message); }
  });
  if (errors.length) {
    const error = new Error('Catalog validation failed: ' + errors.join('; '));
    error.validationErrors = errors;
    throw error;
  }
  const keyConflicts = [...keyRows.entries()].filter(([, productIds]) => productIds.length > 1)
    .map(([key, productIds]) => ({ key, productIds }));
  const conflictProductIds = new Set(keyConflicts.flatMap((entry) => entry.productIds));
  const counts = normalized.reduce((acc, row) => {
    acc.byCountry[row.country] = (acc.byCountry[row.country] || 0) + 1;
    acc.byCurrency[row.destinationCurrency] = (acc.byCurrency[row.destinationCurrency] || 0) + 1;
    if (row.catalogClass === 'ESIM_USD_PIN') acc.esimUsdRows += 1;
    else if (row.catalogClass === 'RANGED_LOCAL_CURRENCY') acc.rangedRows += 1;
    else acc.fixedLocalCurrencyRows += 1;
    return acc;
  }, { byCountry: {}, byCurrency: {}, fixedLocalCurrencyRows: 0, rangedRows: 0, esimUsdRows: 0 });
  counts.legacyNaturalKeyConflictGroups = keyConflicts.length;
  counts.legacyNaturalKeyConflictRows = conflictProductIds.size;
  return Object.freeze({
    status: keyConflicts.length ? 'STRUCTURE_VALID_WITH_LEGACY_DB_KEY_CONFLICTS' : 'STRUCTURE_VALID_PROVIDER_REVIEW_REQUIRED',
    totalRows: normalized.length, counts, keyConflicts,
    rows: normalized,
  });
}
module.exports = { validateCatalogRows, COUNTRY_CURRENCY };
