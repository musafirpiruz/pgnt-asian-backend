'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateStripeFeeSchedule, MIN_STRIPE_FEE_SAMPLES } = require('../stripe-fee-estimator');

test('requires a minimum number of settled Stripe fee observations', () => {
  const rows = Array.from({length: MIN_STRIPE_FEE_SAMPLES - 1}, (_, i) => ({charge_cents:100+i*100,stripe_fee_eur_cents:30+i}));
  const result = estimateStripeFeeSchedule(rows);
  assert.equal(result.ready, false);
  assert.equal(result.requiredSamples, MIN_STRIPE_FEE_SAMPLES);
});

test('estimates a conservative schedule from real fee observations', () => {
  const rows = Array.from({length: 30}, (_, i) => {
    const amount = 100 + i * 100;
    return {charge_cents: amount, stripe_fee_eur_cents: Math.ceil(amount * 0.02) + 25};
  });
  const result = estimateStripeFeeSchedule(rows);
  assert.equal(result.ready, true);
  assert.ok(result.stripeFeePercent >= 2);
  assert.ok(result.stripeFixedFeeCents >= 25);
  assert.equal(result.guaranteed, false);
});

test('rejects samples without sufficient amount variation', () => {
  const rows = Array.from({length: MIN_STRIPE_FEE_SAMPLES}, () => ({charge_cents:500,stripe_fee_eur_cents:35}));
  assert.equal(estimateStripeFeeSchedule(rows).reason, 'insufficient_charge_amount_variation');
});
