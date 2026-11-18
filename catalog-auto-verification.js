'use strict';

const COUNTRY_CURRENCIES = Object.freeze({
  AF: 'AFN',
  PK: 'PKR',
  IN: 'INR',
  BD: 'BDT',
});
const COUNTRY_PROVIDER_CODES = Object.freeze({
  AF: 'AFG',
  PK: 'PAK',
  IN: 'IND',
  BD: 'BGD',
});
const OPERATOR_ALIASES = Object.freeze({
  AF: Object.freeze({ 'ATOMA AFGHANISTAN': 'ATOMA' }),
});
const SUPPORTED_PRODUCT_TYPES = new Set([
  'FIXED_VALUE_RECHARGE',
  'RANGED_VALUE_RECHARGE',
  'FIXED_VALUE_PIN_PURCHASE',
  'RANGED_VALUE_PIN_PURCHASE',
  'RANGED_VALUE_PAYMENT',
]);

function normalizeOperator(country, value) {
  const label = String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return OPERATOR_ALIASES[country]?.[label] || label;
}

function positiveMoneyCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * Compare one local disabled catalog row with one authoritative DT One
 * product response. This is a pure evaluator: it performs no I/O and writes
 * nothing. Callers must persist an audit record and keep activation separate.
 */
function evaluateDtOneCatalogMatch(catalog, providerProduct) {
  const reasons = [];
  if (!catalog || typeof catalog !== 'object' ||
      !providerProduct || typeof providerProduct !== 'object') {
    return { verified: false, reasons: ['missing_catalog_or_provider_record'] };
  }

  const localProductId = String(catalog.product_id ?? '').trim();
  const providerProductId = String(providerProduct.id ?? '').trim();
  if (!localProductId || !providerProductId || localProductId !== providerProductId) {
    reasons.push('provider_product_id_mismatch');
  }

  const iso = String(providerProduct.operator?.country?.iso_code || '').trim().toUpperCase();
  const providerCountry = Object.keys(COUNTRY_PROVIDER_CODES)
    .find((code) => COUNTRY_PROVIDER_CODES[code] === iso) || null;
  if (!providerCountry || providerCountry !== String(catalog.country || '').trim().toUpperCase()) {
    reasons.push('country_mismatch');
  }

  const providerOperator = String(providerProduct.operator?.name || '').trim();
  const providerOperatorId = String(providerProduct.operator?.id ?? '').trim();
  if (!providerOperatorId || !/^[A-Za-z0-9_-]{1,80}$/.test(providerOperatorId)) {
    reasons.push('missing_or_invalid_provider_operator_id');
  }
  if (!providerOperator ||
      normalizeOperator(String(catalog.country || '').toUpperCase(), catalog.operator) !==
      normalizeOperator(providerCountry || '', providerOperator)) {
    reasons.push('operator_mismatch');
  }

  const providerCurrency = String(
    providerProduct.destination?.unit ||
    providerProduct.benefits?.[0]?.amount?.unit || ''
  ).trim().toUpperCase();
  const expectedCurrency = COUNTRY_CURRENCIES[String(catalog.country || '').trim().toUpperCase()];
  if (!expectedCurrency || providerCurrency !== expectedCurrency ||
      String(catalog.currency || '').trim().toUpperCase() !== providerCurrency) {
    reasons.push('currency_mismatch');
  }

  const providerType = String(providerProduct.type || '').trim().toUpperCase();
  if (!SUPPORTED_PRODUCT_TYPES.has(providerType)) {
    reasons.push('unsupported_product_type');
  }

  const amountValue = providerProduct.destination?.amount ??
    providerProduct.benefits?.[0]?.amount?.base;
  const providerAmount = Number(
    amountValue && typeof amountValue === 'object'
      ? amountValue.base ?? amountValue.min
      : amountValue
  );
  if (!Number.isFinite(providerAmount) || providerAmount <= 0 ||
      Number(catalog.amount) !== providerAmount) {
    reasons.push('denomination_mismatch');
  }

  const retailUnit = String(providerProduct.prices?.retail?.unit || '').trim().toUpperCase();
  const wholesaleUnit = String(providerProduct.prices?.wholesale?.unit || '').trim().toUpperCase();
  const retailCents = positiveMoneyCents(providerProduct.prices?.retail?.amount);
  const wholesaleCents = positiveMoneyCents(providerProduct.prices?.wholesale?.amount);
  if (retailUnit !== 'EUR' || wholesaleUnit !== 'EUR' ||
      retailCents === null || wholesaleCents === null || retailCents < wholesaleCents) {
    reasons.push('invalid_or_missing_eur_prices');
  }

  if (catalog.active === true) reasons.push('active_catalog_row_not_eligible_for_auto_verification');

  return {
    verified: reasons.length === 0,
    reasons,
    provider: reasons.length === 0 ? {
      productId: providerProductId,
      operatorId: providerOperatorId,
      country: providerCountry,
      operator: providerOperator,
      currency: providerCurrency,
      productType: providerType,
      amount: providerAmount,
      retailPriceEurCents: retailCents,
      wholesalePriceEurCents: wholesaleCents,
    } : null,
    activationChanged: false,
    databaseModified: false,
    transactionCreated: false,
  };
}

module.exports = { evaluateDtOneCatalogMatch };
