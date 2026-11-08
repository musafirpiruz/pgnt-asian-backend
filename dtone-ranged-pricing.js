'use strict';

function positiveAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function nonNegativeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Validate the price evidence returned by a DT One ranged transaction created
 * with auto_confirm:false. Ranged products expose their actual wholesale price
 * only after the transaction request. PGNT charges customers in EUR, so this
 * helper deliberately refuses to guess or convert a non-EUR provider wallet.
 */
function parseRangedWholesalePrice(response, expected = {}) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('DT One ranged quote response is invalid.');
  }

  const transactionId = response.id == null ? '' : String(response.id);
  const externalId = String(response.external_id || '');
  const productId = response.product && response.product.id != null
    ? String(response.product.id)
    : '';
  const status = String(response.status?.message || response.status || '').trim().toUpperCase();
  const expiration = response.confirmation_expiration_date
    ? new Date(response.confirmation_expiration_date)
    : null;

  if (!/^\d+$/.test(transactionId) ||
      !externalId ||
      (expected.externalId && externalId !== String(expected.externalId)) ||
      (expected.productId && productId !== String(expected.productId)) ||
      status !== 'CREATED' ||
      !expiration || !Number.isFinite(expiration.getTime()) ||
      expiration.getTime() <= Date.now()) {
    throw new Error('DT One ranged quote identity, CREATED status, or confirmation expiry could not be verified.');
  }

  const requestedDestination = response.requested_values?.destination;
  const destinationAmount = positiveAmount(requestedDestination?.amount);
  const expectedAmount = Number(expected.destinationAmount);
  const destinationCurrency = String(requestedDestination?.unit || '').trim().toUpperCase();
  const destinationUnitType = String(requestedDestination?.unit_type || '').trim().toUpperCase();

  if (!Number.isSafeInteger(expectedAmount) ||
      destinationAmount !== expectedAmount ||
      destinationCurrency !== String(expected.destinationCurrency || '').trim().toUpperCase() ||
      destinationUnitType !== 'CURRENCY') {
    throw new Error('DT One ranged quote destination amount or currency does not match the customer request.');
  }

  const wholesale = response.prices?.wholesale;
  const wholesaleAmount = positiveAmount(wholesale?.amount);
  const wholesaleFee = nonNegativeAmount(wholesale?.fee);
  const wholesaleCurrency = String(wholesale?.unit || '').trim().toUpperCase();
  const wholesaleUnitType = String(wholesale?.unit_type || '').trim().toUpperCase();

  if (wholesaleAmount === null || wholesaleFee === null ||
      wholesaleCurrency !== 'EUR' || wholesaleUnitType !== 'CURRENCY') {
    throw new Error('DT One ranged wholesale price must be explicitly quoted in EUR; no implicit FX conversion is allowed.');
  }

  const wholesaleTotalCents = Math.ceil((wholesaleAmount + wholesaleFee) * 100 - 1e-9);
  if (!Number.isSafeInteger(wholesaleTotalCents) || wholesaleTotalCents <= 0) {
    throw new Error('DT One ranged wholesale price is outside the supported EUR range.');
  }

  return Object.freeze({
    transactionId,
    externalId,
    productId,
    destinationAmount: expectedAmount,
    destinationCurrency,
    wholesaleAmount,
    wholesaleFee,
    wholesaleCurrency,
    wholesaleTotalCents,
    confirmationExpiresAt: expiration.toISOString(),
    providerStatus: 'CREATED',
    autoConfirmed: false,
  });
}

module.exports = { parseRangedWholesalePrice };
