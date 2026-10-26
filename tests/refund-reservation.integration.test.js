'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const integrationTest = test(
  'refund reservation survives failed finalization and blocks duplicate reservations in PostgreSQL',
  { skip: !databaseUrl ? 'DATABASE_URL is not configured; PostgreSQL integration test skipped' : false },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    const concurrentClient = await pool.connect();
    const orderId = crypto.randomUUID();
    const concurrentOrderId = crypto.randomUUID();

    try {
      await client.query(
        `INSERT INTO orders
           (order_id, country, operator, phone, amount, currency, product_id,
            product_price_cents, charge_cents, status, dtone_status)
         VALUES ($1, 'AF', 'TEST', '+33000000000', 115, 'AFN', 7194,
                 210, 298, 'topup_review', 'declined')`,
        [orderId]
      );

      await client.query('BEGIN');
      await client.query(
        `INSERT INTO refunds (order_id, amount_cents, status, reason)
         VALUES ($1, 298, 'pending', 'integration test reservation')`,
        [orderId]
      );
      await client.query('COMMIT');

      // Simulate a post-Stripe database finalization that fails: rollback must
      // leave the previously committed reservation untouched.
      await client.query('BEGIN');
      await client.query(
        `UPDATE refunds SET status = 'succeeded', stripe_refund_id = 're_integration_test'
         WHERE order_id = $1`,
        [orderId]
      );
      await client.query('ROLLBACK');

      const persisted = await client.query(
        'SELECT status, stripe_refund_id FROM refunds WHERE order_id = $1',
        [orderId]
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].status, 'pending');
      assert.equal(persisted.rows[0].stripe_refund_id, null);

      await client.query('BEGIN');
      await assert.rejects(
        client.query(
          `INSERT INTO refunds (order_id, amount_cents, status, reason)
           VALUES ($1, 298, 'pending', 'duplicate reservation')`,
          [orderId]
        ),
        error => error && error.code === '23505'
      );
      await client.query('ROLLBACK');

      // Two independent database connections race to reserve the same order.
      // The database uniqueness constraint must allow exactly one reservation.
      await client.query(
        `INSERT INTO orders
           (order_id, country, operator, phone, amount, currency, product_id,
            product_price_cents, charge_cents, status, dtone_status)
         VALUES ($1, 'AF', 'TEST', '+33000000001', 115, 'AFN', 7194,
                 210, 298, 'topup_review', 'declined')`,
        [concurrentOrderId]
      );
      const reservationAttempts = await Promise.allSettled([
        client.query(
          `INSERT INTO refunds (order_id, amount_cents, status, reason)
           VALUES ($1, 298, 'pending', 'concurrent reservation A')`,
          [concurrentOrderId]
        ),
        concurrentClient.query(
          `INSERT INTO refunds (order_id, amount_cents, status, reason)
           VALUES ($1, 298, 'pending', 'concurrent reservation B')`,
          [concurrentOrderId]
        ),
      ]);
      assert.equal(reservationAttempts.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = reservationAttempts.filter(result => result.status === 'rejected');
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.code, '23505');
      const concurrentReservations = await client.query(
        'SELECT id FROM refunds WHERE order_id = $1', [concurrentOrderId]
      );
      assert.equal(concurrentReservations.rowCount, 1);
    } finally {
      try { await client.query('DELETE FROM refunds WHERE order_id = ANY($1::uuid[])', [[orderId, concurrentOrderId]]); } catch (_) {}
      try { await client.query('DELETE FROM orders WHERE order_id = ANY($1::uuid[])', [[orderId, concurrentOrderId]]); } catch (_) {}
      concurrentClient.release();
      client.release();
      await pool.end();
    }
  }
);

module.exports = { integrationTest };
