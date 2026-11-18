'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractStripeFeeEvidence, extractStripeChargeFeeEvidence } = require('../stripe-fee-evidence');

test('extracts exact EUR Stripe fee from a succeeded PaymentIntent BalanceTransaction', () => {
  const result = extractStripeFeeEvidence({
    status: 'succeeded',
    latest_charge: {
      balance_transaction: { id: 'txn_123', fee: 38, currency: 'eur' },
    },
  });
  assert.deepEqual(result, {
    feeEurCents: 38,
    currency: 'eur',
    balanceTransactionId: 'txn_123',
  });
});

test('does not invent a fee when Stripe has not populated the BalanceTransaction', () => {
  assert.equal(extractStripeFeeEvidence({status:'succeeded',latest_charge:{balance_transaction:null}}), null);
  assert.equal(extractStripeFeeEvidence({status:'processing'}), null);
});

test('rejects non-EUR, malformed or negative fee evidence', () => {
  assert.equal(extractStripeFeeEvidence({status:'succeeded',latest_charge:{balance_transaction:{id:'txn',fee:38,currency:'usd'}}}), null);
  assert.equal(extractStripeFeeEvidence({status:'succeeded',latest_charge:{balance_transaction:{id:'txn',fee:-1,currency:'eur'}}}), null);
  assert.equal(extractStripeFeeEvidence({status:'succeeded',latest_charge:{balance_transaction:{id:'txn',fee:1.2,currency:'eur'}}}), null);
});

test('extracts actual EUR fee from a succeeded Charge after charge.updated', () => {
  const result = extractStripeChargeFeeEvidence({
    id: 'ch_test', status: 'succeeded', currency: 'eur', payment_intent: 'pi_test',
    balance_transaction: { id: 'txn_test', fee: 37, currency: 'eur' },
  });
  assert.deepEqual(result, {
    paymentIntentId: 'pi_test', feeEurCents: 37, currency: 'eur',
    balanceTransactionId: 'txn_test',
  });
});

test('does not reconcile missing, non-EUR, or malformed Charge fee evidence', () => {
  assert.equal(extractStripeChargeFeeEvidence({payment_intent:'pi_test',balance_transaction:null}), null);
  assert.equal(extractStripeChargeFeeEvidence({payment_intent:'pi_test',balance_transaction:{id:'txn',fee:37,currency:'usd'}}), null);
  assert.equal(extractStripeChargeFeeEvidence({payment_intent:'pi_test',balance_transaction:{id:'txn',fee:-1,currency:'eur'}}), null);
});
