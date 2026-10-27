'use strict';

// Runtime HTTP smoke tests for the actual refund endpoint. The server runs as a
// child process against CI's isolated PostgreSQL database and a Stripe test key.
// These cases stop before any Stripe API request or refund can be created.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

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

test('refund HTTP route enforces admin auth and safely rejects invalid or unknown orders', {
  skip: !databaseUrl ? 'DATABASE_URL is not configured; requires isolated PostgreSQL test database' : false,
  timeout: 45000,
}, async () => {
  const port = await reserveLocalPort();
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
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
