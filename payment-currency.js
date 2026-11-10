'use strict';

// Customer-facing payment currency policy.
// These are PGNT's application fees, not Stripe processing fees.
// Stripe processing costs are calculated separately from the actual payment
// method/account pricing and reconciled from the Stripe balance transaction.
const PAYMENT_CURRENCY_POLICY = Object.freeze({
  EUR: Object.freeze({ minorUnit: 2, appFeeMinor: 49 }),
  GBP: Object.freeze({ minorUnit: 2, appFeeMinor: 59 }),
  USD: Object.freeze({ minorUnit: 2, appFeeMinor: 59 }),
});

function normalizeCustomerPaymentCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_CURRENCY_POLICY, currency)) {
    throw new Error('Unsupported customer payment currency.');
  }
  return currency;
}

function getCustomerAppFeeMinor(currency) {
  const code = normalizeCustomerPaymentCurrency(currency);
  return PAYMENT_CURRENCY_POLICY[code].appFeeMinor;
}

function requireMinorAmount(value, fieldName = 'payment amount') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`Invalid ${fieldName} in minor units.`);
  }
  return amount;
}

function formatCustomerMoney(minorAmount, currency, locale = 'en-GB') {
  const code = normalizeCustomerPaymentCurrency(currency);
  const amount = requireMinorAmount(minorAmount) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
  }).format(amount);
}

module.exports = {
  PAYMENT_CURRENCY_POLICY,
  normalizeCustomerPaymentCurrency,
  getCustomerAppFeeMinor,
  requireMinorAmount,
  formatCustomerMoney,
};
