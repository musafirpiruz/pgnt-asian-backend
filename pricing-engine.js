'use strict';

// Currency-safe, server-only all-in price calculator.
// FX rate is target major units per source major unit, scaled by 1e8.
// All money inputs/outputs are integer minor units; no floating point money.
const CURRENCY_MINOR_UNITS = Object.freeze({
  EUR: 2,
  USD: 2,
  GBP: 2,
  AFN: 2,
  PKR: 2,
  INR: 2,
  BDT: 2,
});
const FX_SCALE = 100000000n;

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(name + ' must be a positive safe integer.');
  }
  return BigInt(value);
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative safe integer.');
  }
  return BigInt(value);
}

function normalizeCurrency(value, name) {
  const code = String(value || '').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNITS, code)) {
    throw new Error('Unsupported ' + name + ' currency.');
  }
  return code;
}

function ceilDiv(numerator, denominator) {
  if (denominator <= 0n || numerator < 0n) throw new Error('Invalid price arithmetic.');
  return (numerator + denominator - 1n) / denominator;
}

function convertMinorUnits(amountMinor, sourceCurrency, targetCurrency, fxRateScaled) {
  const amount = positiveInteger(amountMinor, 'Wholesale amount');
  const source = normalizeCurrency(sourceCurrency, 'source');
  const target = normalizeCurrency(targetCurrency, 'target');
  const rate = positiveInteger(fxRateScaled, 'FX rate');
  const sourceScale = 10n ** BigInt(CURRENCY_MINOR_UNITS[source]);
  const targetScale = 10n ** BigInt(CURRENCY_MINOR_UNITS[target]);
  const converted = ceilDiv(amount * rate * targetScale, FX_SCALE * sourceScale);
  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Converted wholesale amount exceeds safe integer range.');
  }
  return Number(converted);
}

function calculateAllInPrice(input) {
  if (!input || typeof input !== 'object') throw new Error('Pricing input is required.');
  const paymentCurrency = normalizeCurrency(input.paymentCurrency, 'payment');
  if (!['EUR', 'USD', 'GBP'].includes(paymentCurrency)) {
    throw new Error('Payment currency must be EUR, USD, or GBP.');
  }
  const wholesaleCurrency = normalizeCurrency(input.wholesaleCurrency, 'wholesale');
  const wholesaleMinor = positiveInteger(input.wholesaleAmountMinor, 'Wholesale amount');
  const fxRateScaled = positiveInteger(input.fxRateScaled, 'FX rate');
  const wholesalePaymentMinor = BigInt(convertMinorUnits(
    Number(wholesaleMinor), wholesaleCurrency, paymentCurrency, Number(fxRateScaled)
  ));

  const fixedFee = nonNegativeInteger(input.appFeeFixedMinor ?? 0, 'App fixed fee');
  const feeBps = nonNegativeInteger(input.appFeeBasisPoints ?? 0, 'App fee basis points');
  if (feeBps > 10000n) throw new Error('App fee basis points cannot exceed 10000.');
  const appFeePercentMinor = ceilDiv(wholesalePaymentMinor * feeBps, 10000n);
  const appFeeMinor = fixedFee + appFeePercentMinor;

  const stripeBps = nonNegativeInteger(input.stripeFeeBasisPoints, 'Stripe fee basis points');
  if (stripeBps >= 10000n) throw new Error('Stripe fee basis points must be below 10000.');
  const stripeFixed = nonNegativeInteger(input.stripeFixedFeeMinor, 'Stripe fixed fee');
  const netTarget = wholesalePaymentMinor + appFeeMinor;
  let customerTotalMinor = ceilDiv((netTarget + stripeFixed) * 10000n, 10000n - stripeBps);
  let estimatedStripeFeeMinor = ceilDiv(customerTotalMinor * stripeBps, 10000n) + stripeFixed;
  while (customerTotalMinor - estimatedStripeFeeMinor < netTarget) {
    customerTotalMinor += 1n;
    estimatedStripeFeeMinor = ceilDiv(customerTotalMinor * stripeBps, 10000n) + stripeFixed;
  }

  for (const [name, value] of Object.entries({
    wholesalePaymentMinor, appFeeMinor, estimatedStripeFeeMinor, customerTotalMinor,
  })) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(name + ' exceeds safe integer range.');
  }

  return Object.freeze({
    paymentCurrency,
    wholesaleCurrency,
    wholesaleAmountMinor: Number(wholesaleMinor),
    fxRateScaled: Number(fxRateScaled),
    convertedWholesaleMinor: Number(wholesalePaymentMinor),
    appFeeFixedMinor: Number(fixedFee),
    appFeePercentMinor: Number(appFeePercentMinor),
    appFeeMinor: Number(appFeeMinor),
    estimatedStripeFeeMinor: Number(estimatedStripeFeeMinor),
    customerTotalMinor: Number(customerTotalMinor),
    bonusMinor: 0,
    generalBonusApplied: false,
    quoteOnly: true,
  });
}

module.exports = { CURRENCY_MINOR_UNITS, FX_SCALE: Number(FX_SCALE), convertMinorUnits, calculateAllInPrice };
