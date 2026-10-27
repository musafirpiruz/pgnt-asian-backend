'use strict';

// PostgreSQL integration harness for the exact reservation/locking pattern used
// by the refund route. Uses an isolated synthetic order and a local Stripe mock;
// it never calls Stripe, DT One, or production services.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.DATABASE_URL;

test('concurrent refund reservations allow only one request to reach the Stripe mock', {
  skip: !databaseUrl ? 'DATABASE_URL is not configured; requires isolated PostgreSQL test database' : false,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const orderId = randomUUID();
  let stripeMockCalls = 0;

  // Faithfully exercises the route's critical ordering: lock order, inspect
  // existing reservation, insert unique reservation, COMMIT, then call Stripe.
  async function refundRequest() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query(
        "SELECT order_id FROM orders WHERE order_id = $1 FOR UPDATE",
        [orderId]
      );
      if (order.rowCount !== 1) {
        await client.query('ROLLBACK');
        return 'order_missing';
      }

      const existing = await client.query(
        'SELECT id, status FROM refunds WHERE order_id = $1 FOR UPDATE',
        [orderId]
      );
      if (existing.rowCount > 0) {
        await client.query('ROLLBACK');
        return 'already_reserved';
      }

      await client.query(
        "INSERT INTO refunds (order_id, amount_cents, status, reason) VALUES ($1, 268, 'pending', 'CI concurrency test')",
        [orderId]
      );
      await client.query('COMMIT');

      // Mock boundary occurs only after a request wins and commits reservation.
      stripeMockCalls += 1;
      return 'reserved';
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      if (error.code === '23505') return 'unique_conflict';
      throw error;
    } finally {
      client.release();
    }
  }

  try {
    await pool.query(
      `INSERT INTO orders
        (order_id, country, operator, phone, amount, currency, product_id,
         product_price_cents, fee_cents, bonus_amount, charge_cents, status,
         stripe_payment_intent_id, dtone_status)
       VALUES ($1, 'AF', 'CI-TEST', '+33000000000', 115, 'AFN', 999999,
               268, 0, 0, 268, 'topup_review', 'pi_ci_refund_test', 'declined')`,
      [orderId]
    );

    const outcomes = await Promise.all([refundRequest(), refundRequest()]);
    assert.equal(outcomes.filter(value => value === 'reserved').length, 1, JSON.stringify(outcomes));
    assert.equal(outcomes.filter(value => value === 'already_reserved' || value === 'unique_conflict').length, 1, JSON.stringify(outcomes));
    assert.equal(stripeMockCalls, 1, 'only the winning reservation may reach the Stripe mock');

    const persisted = await pool.query(
      'SELECT COUNT(*)::int AS count FROM refunds WHERE order_id = $1',
      [orderId]
    );
    assert.equal(persisted.rows[0].count, 1, 'exactly one durable reservation must remain');
  } finally {
    await pool.query('DELETE FROM refunds WHERE order_id = $1', [orderId]).catch(() => {});
    await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]).catch(() => {});
    await pool.end();
  }
});
