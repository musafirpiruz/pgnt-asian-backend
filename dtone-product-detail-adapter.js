'use strict';

// Strict adapter for the DT One GET /v1/products/{id} detail response.
// It uses only fields already consumed by the existing read-only catalog sync.
// Unknown service/subservice/product-type fields stay blank so reconciliation
// reports a mismatch instead of inventing a value and producing a false match.

function text(value) {
  return value == null ? '' : String(value).trim();
}

function namedValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (value && typeof value === 'object') return text(value.name || value.message || value.code);
  return '';
}

function firstNonNull(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function normalizeDtOneProductDetail(product, requestedProductId, countryCodeMap = {}) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('DT One product detail must be an object.');
  }

  const productId = text(product.id);
  const requestedId = text(requestedProductId);
  if (!/^[0-9]+$/.test(requestedId) || productId !== requestedId) {
    throw new Error('DT One detail product ID does not match the requested workbook Product ID.');
  }

  const providerCountryCode = text(product.operator?.country?.iso_code).toUpperCase();
  const country = text(countryCodeMap[providerCountryCode] || providerCountryCode).toUpperCase();
  const destinationAmount = firstNonNull(
    product.destination?.amount,
    product.benefits?.[0]?.amount?.base
  );
  const destinationCurrency = text(firstNonNull(
    product.destination?.unit,
    product.benefits?.[0]?.amount?.unit
  )).toUpperCase();

  return Object.freeze({
    productId,
    country,
    operator: text(product.operator?.name),
    // These fields are intentionally strict. They remain blank when the
    // provider response does not expose a recognized value.
    service: namedValue(product.service?.name),
    subservice: namedValue(product.service?.subservice?.name),
    productType: namedValue(product.type).toUpperCase(),
    destinationCurrency,
    destinationAmount: text(destinationAmount),
    wholesalePriceEur: text(product.prices?.wholesale?.amount),
    wholesalePriceCurrency: text(product.prices?.wholesale?.unit).toUpperCase(),
    retailPriceEur: text(product.prices?.retail?.amount),
    retailPriceCurrency: text(product.prices?.retail?.unit).toUpperCase(),
    providerCountryCode,
    rawFieldAvailability: Object.freeze({
      service: Boolean(product.service?.name),
      subservice: Boolean(product.service?.subservice?.name),
      productType: Boolean(product.type),
      wholesalePriceCurrency: Boolean(product.prices?.wholesale?.unit),
      retailPriceCurrency: Boolean(product.prices?.retail?.unit),
    }),
  });
}

module.exports = { normalizeDtOneProductDetail };
