'use strict';

const MIN_STRIPE_FEE_SAMPLES = 20;

/**
 * Conservative EUR fee model learned only from settled Stripe BalanceTransactions.
 * A positive maximum residual is added to the fitted intercept so historical
 * observations are not systematically under-covered. This is an estimate,
 * never a guaranteed Stripe quote.
 */
function estimateStripeFeeSchedule(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Stripe fee samples must be an array.');
  const samples = rows.map(row => ({
    amount: Number(row.charge_cents),
    fee: Number(row.stripe_fee_eur_cents),
  })).filter(row => Number.isSafeInteger(row.amount) && row.amount > 0 &&
    Number.isSafeInteger(row.fee) && row.fee >= 0);
  if (samples.length < MIN_STRIPE_FEE_SAMPLES) {
    return Object.freeze({ ready: false, sampleCount: samples.length, requiredSamples: MIN_STRIPE_FEE_SAMPLES,
      reason: 'insufficient_settled_stripe_fee_history' });
  }
  const meanX = samples.reduce((s, x) => s + x.amount, 0) / samples.length;
  const meanY = samples.reduce((s, x) => s + x.fee, 0) / samples.length;
  const variance = samples.reduce((s, x) => s + (x.amount - meanX) ** 2, 0);
  if (!Number.isFinite(variance) || variance <= 0) {
    return Object.freeze({ ready: false, sampleCount: samples.length, requiredSamples: MIN_STRIPE_FEE_SAMPLES,
      reason: 'insufficient_charge_amount_variation' });
  }
  const slope = samples.reduce((s, x) => s + (x.amount - meanX) * (x.fee - meanY), 0) / variance;
  if (!Number.isFinite(slope) || slope < 0 || slope >= 1) {
    return Object.freeze({ ready: false, sampleCount: samples.length, requiredSamples: MIN_STRIPE_FEE_SAMPLES,
      reason: 'invalid_historical_fee_relationship' });
  }
  const intercept = meanY - slope * meanX;
  const safetyResidual = Math.max(0, ...samples.map(x => x.fee - (slope * x.amount + intercept)));
  const fixedCents = Math.max(0, Math.ceil(intercept + safetyResidual));
  const percent = Math.ceil(slope * 100 * 10000) / 10000;
  if (!Number.isSafeInteger(fixedCents) || percent >= 100) {
    return Object.freeze({ ready: false, sampleCount: samples.length, requiredSamples: MIN_STRIPE_FEE_SAMPLES,
      reason: 'estimated_fee_schedule_out_of_range' });
  }
  return Object.freeze({ ready: true, sampleCount: samples.length, stripeFeePercent: percent,
    stripeFixedFeeCents: fixedCents, method: 'historical_balance_transaction_regression_with_max_residual',
    guaranteed: false });
}

module.exports = { MIN_STRIPE_FEE_SAMPLES, estimateStripeFeeSchedule };
