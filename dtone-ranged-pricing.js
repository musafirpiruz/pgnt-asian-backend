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

  if (!/^\d+$/.test(transactionId) || BigInt(transactionId) <= 0n ||
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
  const destinationUnitType = String(requestedDestination?.unit_type || response.adjusted_values?.destination?.unit_type || expected.destinationUnitType || '').trim().toUpperCase();

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

/**
 * Calculate the customer charge from a provider-confirmed EUR wholesale quote.
 * The returned amount is an integer EUR cent value suitable for Stripe.
 * The function deliberately shares the same gross-up contract as the fixed
 * catalog pricing path without changing that existing path.
 */
function calculateRangedCustomerPrice(wholesaleTotalCents, pricing) {
  const wholesale = Number(wholesaleTotalCents);
  if (!Number.isSafeInteger(wholesale) || wholesale <= 0) {
    throw new Error('Verified ranged wholesale cost in EUR cents is required.');
  }
  if (!pricing || typeof pricing !== 'object') {
    throw new Error('Ranged customer pricing settings are required.');
  }
  const feeCents = Number(pricing.feeCents);
  const stripeFeePercent = Number(pricing.stripeFeePercent);
  const stripeFixedFeeCents = Number(pricing.stripeFixedFeeCents);
  if (!Number.isSafeInteger(feeCents) || feeCents < 0 ||
      !Number.isFinite(stripeFeePercent) || stripeFeePercent < 0 || stripeFeePercent >= 100 ||
      !Number.isSafeInteger(stripeFixedFeeCents) || stripeFixedFeeCents < 0) {
    throw new Error('Ranged customer pricing settings are invalid.');
  }
  const targetNetCents = wholesale + feeCents;
  const rate = stripeFeePercent / 100;
  // Stripe Checkout does not accept sub-minimum EUR charges. Keep the
  // calculated amount at or above the current EUR minimum before fee gross-up.
  const stripeMinimumChargeCents = 50;
  let finalPriceCents = Math.max(
    stripeMinimumChargeCents,
    Math.ceil((targetNetCents + stripeFixedFeeCents) / (1 - rate))
  );
  let estimatedStripeFeeCents = Math.ceil(finalPriceCents * rate) + stripeFixedFeeCents;
  while (finalPriceCents - estimatedStripeFeeCents < targetNetCents) {
    finalPriceCents += 1;
    estimatedStripeFeeCents = Math.ceil(finalPriceCents * rate) + stripeFixedFeeCents;
  }
  if (!Number.isSafeInteger(finalPriceCents) || finalPriceCents <= 0) {
    throw new Error('Ranged customer price is outside the supported EUR range.');
  }
  return Object.freeze({
    currency: 'EUR',
    wholesaleCostCents: wholesale,
    feeCents,
    estimatedStripeFeeCents,
    stripeFeePercent,
    stripeFixedFeeCents,
    finalPriceCents,
    netAfterStripeCents: finalPriceCents - estimatedStripeFeeCents,
  });
}

module.exports = { parseRangedWholesalePrice, calculateRangedCustomerPrice };
