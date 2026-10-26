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
    const orderId = crypto.randomUUID();

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
    } finally {
      try { await client.query('DELETE FROM refunds WHERE order_id = $1', [orderId]); } catch (_) {}
      try { await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]); } catch (_) {}
      client.release();
      await pool.end();
    }
  }
);

module.exports = { integrationTest };
