'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeReservedRefund } = require('../refund-flow');

const order = { stripe_payment_intent_id: 'pi_test_123' };
const quietLogger = { error() {} };

function fakeClient({ failOn = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (failOn && failOn(normalized, params)) throw new Error('injected database failure');
      return { rowCount: 1, rows: [] };
    },
  };
}

test('successful Stripe refund finalizes refund and order in one database transaction', async () => {
  const client = fakeClient();
  let stripeCalls = 0;
  const stripe = { refunds: { async create(payload, options) {
    stripeCalls++;
    assert.equal(payload.payment_intent, order.stripe_payment_intent_id);
    assert.equal(options.idempotencyKey, 'pgnt-refund-order-1');
    return { id: 're_test_1', amount: 268, status: 'succeeded', currency: 'eur' };
  } } };
  const result = await executeReservedRefund({
    client, stripe, order, orderId: 'order-1', reason: 'failed topup', logger: quietLogger,
  });
  assert.equal(result.kind, 'completed');
  assert.equal(result.refund.id, 're_test_1');
  assert.equal(stripeCalls, 1);
  assert.ok(client.calls.some(c => c.sql.startsWith('UPDATE refunds SET stripe_refund_id')));
  assert.ok(client.calls.some(c => c.sql.startsWith('UPDATE orders SET status = \'refunded\'')));
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('ambiguous Stripe error preserves the pending reservation if needs_review write fails', async () => {
  const client = fakeClient({ failOn: sql => sql.startsWith('UPDATE refunds SET status = \'needs_review\'') });
  const stripe = { refunds: { async create() { throw new Error('timeout after request'); } } };
  const result = await executeReservedRefund({
    client, stripe, order, orderId: 'order-1', reason: 'failed topup', logger: quietLogger,
  });
  assert.equal(result.kind, 'needs_review');
  assert.ok(client.calls.some(c => c.sql === 'ROLLBACK'));
  assert.equal(client.calls.filter(c => c.sql === 'COMMIT').length, 0);
  // The helper never deletes the durable reservation; the route committed it before calling this helper.
  assert.ok(client.calls.every(c => !c.sql.startsWith('DELETE FROM refunds')));
});

test('database failure after Stripe success rolls back finalization but never deletes reservation', async () => {
  const client = fakeClient({ failOn: sql => sql.startsWith('UPDATE refunds SET stripe_refund_id') });
  let stripeCalls = 0;
  const stripe = { refunds: { async create() {
    stripeCalls++;
    return { id: 're_test_2', amount: 268, status: 'succeeded', currency: 'eur' };
  } } };
  await assert.rejects(executeReservedRefund({
    client, stripe, order, orderId: 'order-1', reason: 'failed topup', logger: quietLogger,
  }), /injected database failure/);
  assert.equal(stripeCalls, 1);
  assert.ok(client.calls.some(c => c.sql === 'ROLLBACK'));
  assert.ok(client.calls.every(c => !c.sql.startsWith('DELETE FROM refunds')));
});

test('non-succeeded Stripe response is recorded without marking order refunded', async () => {
  const client = fakeClient();
  const stripe = { refunds: { async create() {
    return { id: 're_test_3', amount: 268, status: 'pending', currency: 'eur' };
  } } };
  const result = await executeReservedRefund({
    client, stripe, order, orderId: 'order-1', reason: 'failed topup', logger: quietLogger,
  });
  assert.equal(result.kind, 'completed');
  assert.ok(client.calls.some(c => c.sql.startsWith('UPDATE orders SET status = \'topup_review\'')));
  assert.ok(!client.calls.some(c => c.sql.startsWith('UPDATE orders SET status = \'refunded\'')));
});
