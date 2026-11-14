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
 * Calculate a EUR Checkout amount from a verified DT One ranged quote.
 * Inputs are server-side settings only; no customer-supplied price is accepted.
 * The Stripe gross-up guarantees the retained amount covers wholesale + app fee.
 */
function calculateRangedCustomerPrice(quote, pricing = {}) {
  const wholesaleCents = Number(quote?.wholesaleTotalCents);
  const feeCents = Number(pricing.feeCents);
  const stripeFeePercent = Number(pricing.stripeFeePercent);
  const stripeFixedFeeCents = Number(pricing.stripeFixedFeeCents);

  if (!Number.isSafeInteger(wholesaleCents) || wholesaleCents <= 0 ||
      !Number.isSafeInteger(feeCents) || feeCents < 0 ||
      !Number.isFinite(stripeFeePercent) || stripeFeePercent < 0 || stripeFeePercent >= 100 ||
      !Number.isSafeInteger(stripeFixedFeeCents) || stripeFixedFeeCents < 0) {
    throw new Error('Ranged checkout pricing settings or verified wholesale amount are invalid.');
  }

  const targetNetCents = wholesaleCents + feeCents;
  if (!Number.isSafeInteger(targetNetCents)) {
    throw new Error('Ranged checkout target amount is outside the supported EUR range.');
  }

  const stripeRate = stripeFeePercent / 100;
  let finalPriceCents = Math.ceil(
    (targetNetCents + stripeFixedFeeCents) / (1 - stripeRate)
  );
  let estimatedStripeFeeCents =
    Math.ceil(finalPriceCents * stripeRate) + stripeFixedFeeCents;

  while (finalPriceCents - estimatedStripeFeeCents < targetNetCents) {
    finalPriceCents += 1;
    estimatedStripeFeeCents =
      Math.ceil(finalPriceCents * stripeRate) + stripeFixedFeeCents;
    if (!Number.isSafeInteger(finalPriceCents)) {
      throw new Error('Ranged checkout customer price is outside the supported EUR range.');
    }
  }

  return Object.freeze({
    currency: 'EUR',
    wholesaleCents,
    feeCents,
    estimatedStripeFeeCents,
    stripeFeePercent,
    stripeFixedFeeCents,
    finalPriceCents,
    retainedAfterEstimatedStripeFeeCents: finalPriceCents - estimatedStripeFeeCents,
  });
}


const RANGED_DESTINATION_CURRENCIES = new Set(['AFN', 'PKR', 'INR', 'BDT']);

/**
 * Build the exact two-step DT One create request for a destination-amount
 * ranged recharge. auto_confirm is deliberately false so payment can happen
 * before the provider transaction is confirmed.
 */
function buildRangedTransactionPayload(input = {}) {
  const productId = String(input.productId || '').trim();
  const externalId = String(input.externalId || '').trim();
  const destinationCurrency = String(input.destinationCurrency || '').trim().toUpperCase();
  const destinationAmount = Number(input.destinationAmount);
  const minAmount = Number(input.minAmount);
  const maxAmount = Number(input.maxAmount);
  const amountIncrement = Number(input.amountIncrement);
  const phone = String(input.internationalPhone || '').trim();
  let callback;
  try { callback = new URL(String(input.callbackUrl || '')); } catch (_) {}

  if (!/^\d{1,18}$/.test(productId) ||
      !/^[A-Za-z0-9._:-]{1,100}$/.test(externalId) ||
      !RANGED_DESTINATION_CURRENCIES.has(destinationCurrency) ||
      !Number.isSafeInteger(destinationAmount) || destinationAmount < 75 || destinationAmount > 3000 ||
      !Number.isSafeInteger(minAmount) || minAmount < 75 ||
      !Number.isSafeInteger(maxAmount) || maxAmount < minAmount || maxAmount > 3000 ||
      !Number.isSafeInteger(amountIncrement) || amountIncrement < 1 ||
      destinationAmount < minAmount || destinationAmount > maxAmount ||
      (destinationAmount - minAmount) % amountIncrement !== 0 ||
      !/^\+[1-9]\d{7,14}$/.test(phone) ||
      !callback || callback.protocol !== 'https:') {
    throw new Error('Ranged DT One transaction request contains invalid identity, amount, recipient, currency, or callback URL.');
  }

  return Object.freeze({
    external_id: externalId,
    product_id: Number(productId),
    calculation_mode: 'DESTINATION_AMOUNT',
    destination: {
      unit_type: 'CURRENCY',
      unit: destinationCurrency,
      amount: destinationAmount,
    },
    credit_party_identifier: { mobile_number: phone },
    auto_confirm: false,
    callback_url: callback.toString(),
  });
}

/**
 * Return the DT One async confirmation path only while a verified CREATED
 * quote is still within its provider-issued confirmation window.
 */
function getRangedConfirmationPath(quote, now = Date.now()) {
  const transactionId = String(quote?.transactionId || '').trim();
  const expiration = new Date(quote?.confirmationExpiresAt || '');
  if (!/^\d+$/.test(transactionId) ||
      !Number.isFinite(expiration.getTime()) ||
      !Number.isFinite(now) ||
      expiration.getTime() <= now ||
      quote?.providerStatus !== 'CREATED' ||
      quote?.autoConfirmed !== false) {
    throw new Error('DT One ranged quote is not eligible for confirmation.');
  }
  return `/v1/async/transactions/${encodeURIComponent(transactionId)}/confirm`;
}

/** Verify the provider's response after an explicit two-step confirmation. */
function verifyRangedConfirmation(response, expected = {}) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('DT One ranged confirmation response is invalid.');
  }
  const transactionId = String(response.id ?? '').trim();
  const externalId = String(response.external_id || '');
  const productId = String(response.product?.id ?? '').trim();
  const status = String(response.status?.message || response.status || '').trim().toUpperCase();
  if (!/^\d+$/.test(transactionId) ||
      transactionId !== String(expected.transactionId || '') ||
      externalId !== String(expected.externalId || '') ||
      productId !== String(expected.productId || '') ||
      !['CONFIRMED', 'SUBMITTED'].includes(status)) {
    throw new Error('DT One ranged confirmation identity or CONFIRMED status could not be verified.');
  }
  return Object.freeze({
    transactionId,
    externalId,
    productId,
    providerStatus: status,
    confirmedAt: new Date().toISOString(),
  });
}

module.exports = { parseRangedWholesalePrice, calculateRangedCustomerPrice, buildRangedTransactionPayload, getRangedConfirmationPath, verifyRangedConfirmation };
