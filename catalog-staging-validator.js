'use strict';

// Offline-only catalogue validator. It never connects to PostgreSQL, DT One,
// Stripe, or the live service. Valid rows are returned inactive and unverified.
const COUNTRY_CURRENCY = Object.freeze({
  AF: 'AFN',
  PK: 'PKR',
  IN: 'INR',
  BD: 'BDT',
});
const FIXED_TYPES = new Set(['FIXED_VALUE_RECHARGE', 'FIXED_VALUE_PIN_PURCHASE']);
const RANGED_TYPES = new Set(['RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT']);

function positiveNumber(value, field, required = true) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (!required) return null;
    throw new Error(field + ' is required');
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(field + ' must be a positive number');
  return n;
}

function validateCatalogRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Catalog rows must be a non-empty array');
  const ids = new Set();
  const businessKeys = new Set();
  const countries = new Set();
  const normalized = [];
  const errors = [];

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
      if (currency !== COUNTRY_CURRENCY[country]) throw new Error('destination currency mismatch for ' + country + '; expected ' + COUNTRY_CURRENCY[country]);
      const operator = String(row.operator || '').trim();
      if (!operator) throw new Error('operator is required');
      const amount = positiveNumber(row.destinationAmount, 'destinationAmount');
      const type = String(row.productType || '').trim().toUpperCase();
      if (!FIXED_TYPES.has(type) && !RANGED_TYPES.has(type)) throw new Error('unsupported productType ' + type);

      const wholesale = positiveNumber(row.wholesalePriceEur, 'wholesalePriceEur', FIXED_TYPES.has(type));
      const retail = positiveNumber(row.retailPriceEur, 'retailPriceEur', FIXED_TYPES.has(type));
      if (wholesale !== null && retail !== null && retail < wholesale) {
        throw new Error('retailPriceEur cannot be below wholesalePriceEur');
      }
      const key = [country, operator.toLowerCase(), amount, currency].join('|');
      if (businessKeys.has(key)) throw new Error('duplicate country/operator/amount/currency key');
      businessKeys.add(key);
      countries.add(country);

      normalized.push(Object.freeze({
        productId, country, operator, destinationAmount: amount,
        destinationCurrency: currency, productType: type,
        wholesalePriceEur: wholesale, retailPriceEur: retail,
        providerVerified: false, active: false,
      }));
    } catch (error) {
      errors.push(prefix + error.message);
    }
  });

  if (errors.length) {
    const error = new Error('Catalog validation failed: ' + errors.join('; '));
    error.validationErrors = errors;
    throw error;
  }

  const counts = normalized.reduce((acc, row) => {
    acc.byCountry[row.country] = (acc.byCountry[row.country] || 0) + 1;
    if (FIXED_TYPES.has(row.productType)) acc.fixedPriceRows += 1;
    else acc.rangedRows += 1;
    return acc;
  }, { byCountry: {}, fixedPriceRows: 0, rangedRows: 0 });

  return Object.freeze({
    status: 'STRUCTURE_VALID_PROVIDER_REVIEW_REQUIRED',
    totalRows: normalized.length,
    counts,
    rows: normalized,
  });
}

module.exports = { validateCatalogRows, COUNTRY_CURRENCY };
