'use strict';

const MIN_CUSTOMER_AMOUNT = 75;
const MAX_CUSTOMER_AMOUNT = 3000;
const MOBILE_SERVICE_ID = 1;
const FIXED_RECHARGE_TYPE = 'FIXED_VALUE_RECHARGE';

/**
 * Fail-closed validation for products entering the fixed top-up catalog.
 * DT One product discovery includes multiple product types and service
 * domains; only fixed Mobile recharge products with EUR prices and an
 * integer destination amount in the PGNT 75–3000 range are eligible.
 */
function inspectFixedRechargeProduct(product, expectedCurrency) {
  const reject = (reason) => Object.freeze({ eligible: false, reason });
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return reject('DT One product detail is missing or malformed.');
  }

  const productType = String(product.type || '').trim().toUpperCase();
  if (productType !== FIXED_RECHARGE_TYPE) {
    return reject('Only FIXED_VALUE_RECHARGE products may enter the fixed top-up catalog.');
  }

  if (Number(product.service?.id) !== MOBILE_SERVICE_ID) {
    return reject('DT One product is not in the Mobile service.');
  }

  const subserviceName = String(
    product.subservice?.name ?? product.sub_service?.name ?? ''
  ).trim();
  if (subserviceName && !/airtime/i.test(subserviceName)) {
    return reject('DT One product is not an Airtime subservice.');
  }

  const currency = String(product.destination?.unit || '').trim().toUpperCase();
  const expected = String(expectedCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(expected) || currency !== expected) {
    return reject('DT One destination currency does not match the selected country.');
  }

  const amount = Number(product.destination?.amount);
  if (!Number.isSafeInteger(amount) ||
      amount < MIN_CUSTOMER_AMOUNT ||
      amount > MAX_CUSTOMER_AMOUNT) {
    return reject('Fixed recharge amount must be an integer between 75 and 3000 in local currency.');
  }

  const wholesaleUnit = String(product.prices?.wholesale?.unit || '').trim().toUpperCase();
  const retailUnit = String(product.prices?.retail?.unit || '').trim().toUpperCase();
  if (wholesaleUnit !== 'EUR' || retailUnit !== 'EUR') {
    return reject('DT One wholesale and retail prices must both be explicitly denominated in EUR.');
  }

  const wholesalePriceEur = Number(product.prices?.wholesale?.amount);
  const retailPriceEur = Number(product.prices?.retail?.amount);
  if (!Number.isFinite(wholesalePriceEur) || wholesalePriceEur <= 0 ||
      !Number.isFinite(retailPriceEur) || retailPriceEur <= 0 ||
      retailPriceEur < wholesalePriceEur) {
    return reject('DT One EUR wholesale and retail prices are missing or inconsistent.');
  }

  const wholesaleCents = Math.round(wholesalePriceEur * 100);
  const retailCents = Math.round(retailPriceEur * 100);
  if (!Number.isSafeInteger(wholesaleCents) || wholesaleCents <= 0 ||
      !Number.isSafeInteger(retailCents) || retailCents <= 0) {
    return reject('DT One EUR prices cannot be safely represented in cents.');
  }

  const operator = String(product.operator?.name || '').trim();
  if (!operator) return reject('DT One operator identity is missing.');

  return Object.freeze({
    eligible: true,
    productType,
    serviceId: MOBILE_SERVICE_ID,
    operator,
    amount,
    currency,
    wholesalePriceEur,
    retailPriceEur,
    wholesaleCents,
    retailCents,
  });
}

module.exports = {
  MIN_CUSTOMER_AMOUNT,
  MAX_CUSTOMER_AMOUNT,
  inspectFixedRechargeProduct,
};
