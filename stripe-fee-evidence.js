'use strict';

/**
 * Extract the actual Stripe processing fee from a succeeded PaymentIntent.
 * Stripe exposes this through Charge.balance_transaction, not as a reliable
 * universal pre-checkout quote. Returns null until Stripe has populated it.
 */
function extractStripeFeeEvidence(paymentIntent) {
  if (!paymentIntent || paymentIntent.status !== 'succeeded') return null;
  const charge = paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object'
    ? paymentIntent.latest_charge
    : null;
  const transaction = charge?.balance_transaction && typeof charge.balance_transaction === 'object'
    ? charge.balance_transaction
    : null;
  if (!transaction || !Number.isSafeInteger(transaction.fee) || transaction.fee < 0) return null;
  const currency = String(transaction.currency || '').toLowerCase();
  if (currency !== 'eur' || typeof transaction.id !== 'string' || !transaction.id) return null;
  return Object.freeze({
    feeEurCents: transaction.fee,
    currency,
    balanceTransactionId: transaction.id,
  });
}

module.exports = { extractStripeFeeEvidence };
