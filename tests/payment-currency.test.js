'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAYMENT_CURRENCY_POLICY,
  normalizeCustomerPaymentCurrency,
  getCustomerAppFeeMinor,
  requireMinorAmount,
  formatCustomerMoney,
} = require('../payment-currency');

test('supports only EUR, GBP and USD customer payment currencies', () => {
  assert.deepEqual(Object.keys(PAYMENT_CURRENCY_POLICY), ['EUR', 'GBP', 'USD']);
  assert.equal(normalizeCustomerPaymentCurrency(' eur '), 'EUR');
  assert.equal(normalizeCustomerPaymentCurrency('gbp'), 'GBP');
  assert.equal(normalizeCustomerPaymentCurrency('USD'), 'USD');
  assert.throws(() => normalizeCustomerPaymentCurrency('AFN'), /Unsupported/);
});

test('keeps the configured app fee independent by payment currency', () => {
  assert.equal(getCustomerAppFeeMinor('EUR'), 49);
  assert.equal(getCustomerAppFeeMinor('GBP'), 59);
  assert.equal(getCustomerAppFeeMinor('USD'), 59);
});

test('validates Stripe amounts as positive integer minor units', () => {
  assert.equal(requireMinorAmount(1234), 1234);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, 'abc']) {
    assert.throws(() => requireMinorAmount(invalid));
  }
});

test('formats the same integer minor-unit amount in its selected currency', () => {
  assert.match(formatCustomerMoney(1234, 'EUR', 'en-IE'), /€12\.34/);
  assert.match(formatCustomerMoney(1234, 'GBP', 'en-GB'), /£12\.34/);
  assert.match(formatCustomerMoney(1234, 'USD', 'en-US'), /\$12\.34/);
});
