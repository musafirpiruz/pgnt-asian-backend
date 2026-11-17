'use strict';

// Strict adapter for the DT One GET /v1/products/{id} detail response.
// Missing or unrecognized fields remain blank so the comparison cannot guess.
function text(value) {
  return value == null ? '' : String(value).trim();
}

function namedValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (value && typeof value === 'object') return text(value.name || value.message || value.code);
  return '';
}

function amountValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (typeof value === 'object') {
    if (value.min != null && value.max != null) {
      return text(value.min) + ' - ' + text(value.max);
    }
    if (value.value != null) return amountValue(value.value);
  }
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
    product.benefits?.[0]?.unit
  )).toUpperCase();

  return Object.freeze({
    productId,
    country,
    operator: text(product.operator?.name),
    service: namedValue(product.service?.name),
    subservice: namedValue(product.service?.subservice?.name),
    productType: namedValue(product.type).toUpperCase(),
    destinationCurrency,
    destinationAmount: amountValue(destinationAmount),
    wholesalePriceEur: amountValue(product.prices?.wholesale?.amount),
    wholesalePriceCurrency: text(product.prices?.wholesale?.unit).toUpperCase(),
    retailPriceEur: amountValue(product.prices?.retail?.amount),
    retailPriceCurrency: text(product.prices?.retail?.unit).toUpperCase(),
    providerCountryCode,
    rawFieldAvailability: Object.freeze({
      service: Boolean(product.service?.name),
      subservice: Boolean(product.service?.subservice?.name),
      productType: Boolean(product.type),
      destinationAmount: Boolean(destinationAmount),
      wholesalePrice: Boolean(product.prices?.wholesale?.amount),
      retailPrice: Boolean(product.prices?.retail?.amount),
      wholesalePriceCurrency: Boolean(product.prices?.wholesale?.unit),
      retailPriceCurrency: Boolean(product.prices?.retail?.unit),
    }),
  });
}

module.exports = { normalizeDtOneProductDetail, amountValue };
