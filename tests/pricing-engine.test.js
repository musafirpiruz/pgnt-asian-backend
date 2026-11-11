'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAllInPrice, convertMinorUnits } = require('../pricing-engine');

const fx1 = 100000000; // 1.00000000 target major per source major

test('EUR quote includes wholesale, admin fee and Stripe gross-up in one customer total', () => {
  const quote = calculateAllInPrice({
    wholesaleAmountMinor: 189, wholesaleCurrency: 'EUR',
    paymentCurrency: 'EUR', fxRateScaled: fx1,
    appFeeFixedMinor: 49, appFeeBasisPoints: 0,
    stripeFeeBasisPoints: 150, stripeFixedFeeMinor: 25,
  });
  assert.equal(quote.convertedWholesaleMinor, 189);
  assert.equal(quote.appFeeMinor, 49);
  assert.equal(quote.customerTotalMinor - quote.estimatedStripeFeeMinor, 238);
  assert.equal(quote.generalBonusApplied, false);
  assert.equal(quote.bonusMinor, 0);
});

test('USD and GBP use the selected payment currency and minor-unit totals', () => {
  const common = {
    wholesaleAmountMinor: 1000, wholesaleCurrency: 'EUR',
    fxRateScaled: 110000000, appFeeFixedMinor: 50,
    appFeeBasisPoints: 0, stripeFeeBasisPoints: 200,
    stripeFixedFeeMinor: 30,
  };
  const usd = calculateAllInPrice({ ...common, paymentCurrency: 'USD' });
  const gbp = calculateAllInPrice({ ...common, paymentCurrency: 'GBP' });
  assert.equal(usd.convertedWholesaleMinor, 1100);
  assert.equal(gbp.convertedWholesaleMinor, 1100);
  assert.equal(usd.paymentCurrency, 'USD');
  assert.equal(gbp.paymentCurrency, 'GBP');
  assert.ok(usd.customerTotalMinor > gbp.convertedWholesaleMinor);
});

test('FX conversion rounds upward and returns a safe integer minor-unit amount', () => {
  const converted = convertMinorUnits(101, 'EUR', 'USD', 110000000);
  assert.equal(converted, 112);
  assert.equal(Number.isSafeInteger(converted), true);
});

test('app percentage fee is included before Stripe gross-up', () => {
  const quote = calculateAllInPrice({
    wholesaleAmountMinor: 1000, wholesaleCurrency: 'EUR',
    paymentCurrency: 'EUR', fxRateScaled: fx1,
    appFeeFixedMinor: 10, appFeeBasisPoints: 500,
    stripeFeeBasisPoints: 0, stripeFixedFeeMinor: 0,
  });
  assert.equal(quote.appFeePercentMinor, 50);
  assert.equal(quote.appFeeMinor, 60);
  assert.equal(quote.customerTotalMinor, 1060);
});

test('rejects unsupported payment currency and invalid or missing FX', () => {
  const base = {
    wholesaleAmountMinor: 100, wholesaleCurrency: 'EUR',
    fxRateScaled: fx1, appFeeFixedMinor: 0, appFeeBasisPoints: 0,
    stripeFeeBasisPoints: 100, stripeFixedFeeMinor: 10,
  };
  assert.throws(() => calculateAllInPrice({ ...base, paymentCurrency: 'AFN' }), /Payment currency/);
  assert.throws(() => calculateAllInPrice({ ...base, paymentCurrency: 'EUR', fxRateScaled: 0 }), /FX rate/);
});

test('rejects invalid Stripe fee configuration', () => {
  assert.throws(() => calculateAllInPrice({
    wholesaleAmountMinor: 100, wholesaleCurrency: 'EUR',
    paymentCurrency: 'EUR', fxRateScaled: fx1,
    appFeeFixedMinor: 0, appFeeBasisPoints: 0,
    stripeFeeBasisPoints: 10000, stripeFixedFeeMinor: 0,
  }), /Stripe fee basis points/);
});
