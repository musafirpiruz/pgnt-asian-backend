'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractStripeFeeEvidence } = require('../stripe-fee-evidence');

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
