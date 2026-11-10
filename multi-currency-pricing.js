'use strict';

// Pure, currency-agnostic gross-up calculation.
// All monetary inputs are integer minor units in the SAME currency.
// Stripe fee inputs are estimates supplied by reviewed currency/payment-method
// configuration; they are not a substitute for the actual balance transaction.
function calculateCustomerCharge({
  currency,
  wholesaleCostMinor,
  appFeeMinor,
  stripeFeePercent,
  stripeFixedFeeMinor,
}) {
  const code = String(currency || '').trim().toUpperCase();
  if (!['EUR', 'GBP', 'USD'].includes(code)) {
    throw new Error('Unsupported customer payment currency.');
  }

  const wholesale = Number(wholesaleCostMinor);
  const appFee = Number(appFeeMinor);
  const fixed = Number(stripeFixedFeeMinor);
  const percent = Number(stripeFeePercent);

  for (const [value, label] of [
    [wholesale, 'wholesale cost'],
    [appFee, 'application fee'],
    [fixed, 'estimated Stripe fixed fee'],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid ${label} in minor units.`);
    }
  }
  if (wholesale <= 0) throw new Error('Wholesale cost must be positive.');
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
    throw new Error('Invalid estimated Stripe fee percentage.');
  }

  const targetNet = wholesale + appFee;
  if (!Number.isSafeInteger(targetNet)) throw new Error('Target net amount is out of range.');

  const rate = percent / 100;
  let customerChargeMinor = Math.ceil((targetNet + fixed) / (1 - rate));
  let estimatedStripeFeeMinor = Math.ceil(customerChargeMinor * rate) + fixed;

  while (customerChargeMinor - estimatedStripeFeeMinor < targetNet) {
    customerChargeMinor += 1;
    estimatedStripeFeeMinor = Math.ceil(customerChargeMinor * rate) + fixed;
    if (!Number.isSafeInteger(customerChargeMinor)) {
      throw new Error('Customer charge is outside the supported range.');
    }
  }

  return Object.freeze({
    currency: code,
    wholesaleCostMinor: wholesale,
    appFeeMinor: appFee,
    estimatedStripeFeeMinor,
    customerChargeMinor,
    estimatedNetAfterStripeMinor: customerChargeMinor - estimatedStripeFeeMinor,
    estimatedNetAfterWholesaleMinor: customerChargeMinor - estimatedStripeFeeMinor - wholesale,
  });
}

module.exports = { calculateCustomerCharge };
