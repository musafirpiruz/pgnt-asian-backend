'use strict';

// Runtime HTTP smoke tests for the actual refund endpoint. The server runs as a
// child process against CI's isolated PostgreSQL database and a Stripe test key.
// These cases stop before any Stripe API request or refund can be created.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

async function reserveLocalPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('refund HTTP route enforces admin auth and rejects invalid, unknown, and ineligible orders', {
  skip: !databaseUrl ? 'DATABASE_URL is not configured; requires isolated PostgreSQL test database' : false,
  timeout: 45000,
}, async () => {
  const port = await reserveLocalPort();
  const db = new Pool({ connectionString: databaseUrl, max: 3 });
  const seededOrderIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const adminKey = 'ci-refund-route-test-admin-key';
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      STRIPE_SECRET_KEY: 'sk_test_ci_refund_route_only',
      STRIPE_WEBHOOK_SECRET: '',
      ADMIN_API_KEY: adminKey,
      NODE_ENV: 'test',
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${path.join(__dirname, 'stripe-route-mock.js')}`].filter(Boolean).join(' '),
      STRIPE_MOCK_METADATA_ORDER_ID: 'intentionally-wrong-order-id',
      STRIPE_MOCK_MATCH_ORDER_ID: seededOrderIds[4],
      STRIPE_MOCK_FINALIZATION_FAILURE_ORDER_ID: seededOrderIds[5],
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk.toString(); });
  child.stderr.on('data', chunk => { logs += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Test server exited early (code ${child.exitCode}). Logs: ${logs}`);
      }
      try {
        const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch (_) {
        // Server is not listening yet; retry until the bounded deadline.
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.ok(ready, `Test server did not become healthy. Logs: ${logs}`);

    const orderId = '11111111-1111-4111-8111-111111111111';
    const unauthenticated = await fetch(`${baseUrl}/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(unauthenticated.status, 401, 'requests without admin credentials must be rejected');
    assert.equal((await unauthenticated.json()).error, 'Unauthorized.');

    const invalidId = await fetch(`${baseUrl}/api/admin/orders/not-a-uuid/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(invalidId.status, 400, 'authenticated requests with invalid order IDs must be rejected');

    const missingOrder = await fetch(`${baseUrl}/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(missingOrder.status, 404, 'unknown order IDs must be rejected before Stripe is called');
    assert.equal((await missingOrder.json()).error, 'Order not found.');

    // Seed ineligible orders in the isolated CI database. Both must be rejected
    // before Stripe PaymentIntent retrieval, so these requests cannot create refunds.
    await db.query(
      "INSERT INTO orders (order_id, country, operator, phone, amount, currency, product_id, product_price_cents, fee_cents, bonus_amount, charge_cents, status, stripe_payment_intent_id, dtone_status) VALUES ($1, 'AF', 'CI-TEST', '+33000000000', 115, 'AFN', 999999, 268, 0, 0, 268, 'topup_review', 'pi_ci_not_final', 'processing'), ($2, 'AF', 'CI-TEST', '+33000000001', 115, 'AFN', 999999, 268, 0, 0, 268, 'completed', 'pi_ci_completed', 'completed'), ($3, 'AF', 'CI-TEST', '+33000000002', 115, 'AFN', 999999, 268, 0, 0, 268, 'topup_review', NULL, 'declined'), ($4, 'AF', 'CI-TEST', '+33000000003', 115, 'AFN', 999999, 268, 0, 0, 268, 'topup_review', 'pi_ci_mismatched_metadata', 'declined'), ($5, 'AF', 'CI-TEST', '+33000000004', 115, 'AFN', 999999, 268, 0, 0, 268, 'topup_review', 'pi_ci_match_existing_reservation', 'declined'), ($6, 'AF', 'CI-TEST', '+33000000005', 115, 'AFN', 999999, 268, 0, 0, 268, 'topup_review', 'pi_ci_finalization_failure', 'declined')",
      seededOrderIds
    );
    await db.query(
      "INSERT INTO refunds (order_id, amount_cents, status, reason) VALUES ($1, 268, 'pending', 'CI pre-existing reservation')",
      [seededOrderIds[4]]
    );

    const nonFinal = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[0]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(nonFinal.status, 409, 'non-final DT One statuses must be rejected before Stripe lookup');
    assert.match((await nonFinal.json()).error, /final DT One failure status/i);

    const completed = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[1]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(completed.status, 409, 'completed orders must not be refunded');
    assert.match((await completed.json()).error, /already completed or refunded/i);

    const missingPaymentIntent = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[2]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(missingPaymentIntent.status, 409, 'orders without a stored PaymentIntent must be rejected');
    assert.match((await missingPaymentIntent.json()).error, /no verified Stripe PaymentIntent/i);

    // This eligible-looking order reaches Stripe verification, but the isolated Stripe mock
    // returns metadata for a different order. It must fail before reservation/refund creation.
    const mismatchedPaymentIntent = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[3]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(mismatchedPaymentIntent.status, 409, 'a PaymentIntent associated with another order must be rejected');
    assert.match((await mismatchedPaymentIntent.json()).error, /Stripe payment verification did not match this order/i);
    assert.doesNotMatch(logs, /STRIPE_REFUNDS_CREATE_CALLED/, 'Stripe refunds.create must not be called for a mismatched PaymentIntent');

    const existingReservationRequest = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[4]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI test only' }),
    });
    assert.equal(existingReservationRequest.status, 409, 'an existing pending reservation must block a second refund attempt');
    assert.match((await existingReservationRequest.json()).error, /refund record already exists/i);
    assert.doesNotMatch(logs, /STRIPE_REFUNDS_CREATE_CALLED/, 'the Stripe refund endpoint must never be called in these guard tests');

    // Simulate a database failure after the local Stripe mock confirms success.
    // The committed pending reservation must survive, and a retry must be blocked.
    await db.query(`CREATE OR REPLACE FUNCTION ci_fail_refund_finalization() RETURNS trigger LANGUAGE plpgsql AS $ BEGIN RAISE EXCEPTION 'CI simulated refund finalization failure'; END; $`);
    await db.query(`CREATE TRIGGER ci_fail_refund_finalization BEFORE UPDATE ON refunds FOR EACH ROW WHEN (NEW.order_id = '${seededOrderIds[5]}') EXECUTE FUNCTION ci_fail_refund_finalization()`);

    const finalizationFailure = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[5]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI simulated finalization failure' }),
    });
    assert.equal(finalizationFailure.status, 500, 'database finalization failure after Stripe success must return a reconciliation error');
    assert.match((await finalizationFailure.json()).error, /reconcile Stripe Dashboard before retrying/i);
    assert.equal((logs.match(/STRIPE_REFUNDS_CREATE_CALLED/g) || []).length, 1, 'the first request must invoke only the local Stripe refund mock once');
    const retainedReservation = await db.query('SELECT status FROM refunds WHERE order_id = $1', [seededOrderIds[5]]);
    assert.equal(retainedReservation.rowCount, 1, 'the pre-committed reservation must survive finalization failure');
    assert.equal(retainedReservation.rows[0].status, 'pending', 'failed finalization must leave the durable reservation pending for reconciliation');

    const retryAfterFailure = await fetch(`${baseUrl}/api/admin/orders/${seededOrderIds[5]}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ reason: 'CI retry must be blocked' }),
    });
    assert.equal(retryAfterFailure.status, 409, 'a retry must be blocked by the retained reservation');
    assert.match((await retryAfterFailure.json()).error, /refund record already exists/i);
    assert.equal((logs.match(/STRIPE_REFUNDS_CREATE_CALLED/g) || []).length, 1, 'retry must not create a second Stripe refund');

    const reservations = await db.query(
      'SELECT order_id, COUNT(*)::int AS count FROM refunds WHERE order_id = ANY($1::text[]) GROUP BY order_id',
      [seededOrderIds]
    );
    assert.equal(reservations.rows.length, 1, 'only the intentionally pre-seeded reservation may exist');
    assert.equal(reservations.rows[0].order_id, seededOrderIds[4]);
    assert.equal(reservations.rows[0].count, 1, 'a second reservation must not be created');
  } finally {
    await db.query('DROP TRIGGER IF EXISTS ci_fail_refund_finalization ON refunds').catch(() => {});
    await db.query('DROP FUNCTION IF EXISTS ci_fail_refund_finalization()').catch(() => {});
    await db.query('DELETE FROM refunds WHERE order_id = ANY($1::text[])', [seededOrderIds]).catch(() => {});
    await db.query('DELETE FROM orders WHERE order_id = ANY($1::text[])', [seededOrderIds]).catch(() => {});
    await db.end();
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
