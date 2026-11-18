'use strict';

// Runtime HTTP tests for the real country-operator sample approval routes.
// Uses the CI-only PostgreSQL database and never calls DT One: all exercised
// approval requests stop at auth, input validation, or the DB mapping guard.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

async function reserveLocalPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('country operator approval HTTP routes enforce auth, validation and mapped-product guards', {
  skip: !databaseUrl ? 'DATABASE_URL is not configured; requires isolated PostgreSQL test database' : false,
  timeout: 45000,
}, async () => {
  const port = await reserveLocalPort();
  const db = new Pool({ connectionString: databaseUrl, max: 3 });
  const adminKey = 'ci-country-approval-test-admin-key';
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      ADMIN_API_KEY: adminKey,
      DTONE_API_KEY: 'ci-not-a-real-dtone-key',
      DTONE_API_SECRET: 'ci-not-a-real-dtone-secret',
      DTONE_API_BASE_URL: 'https://preprod-dvs-api.dtone.com',
      // A syntactically valid test-mode key satisfies startup; these routes never call Stripe.\n      STRIPE_SECRET_KEY: 'sk_test_ci_country_approval_no_network',
      STRIPE_WEBHOOK_SECRET: '',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk.toString(); });
  child.stderr.on('data', chunk => { logs += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Test server exited early (code ${child.exitCode}). Logs: ${logs}`);
      try {
        const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) { ready = true; break; }
      } catch (_) { /* wait for server startup */ }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.ok(ready, `Test server did not become healthy. Logs: ${logs}`);

    const operatorId = 2147483000;
    const productId = 2147483000;
    const unauthenticated = await fetch(`${baseUrl}/api/admin/country-operators/${operatorId}/catalog-candidates`);
    assert.equal(unauthenticated.status, 401, 'candidate listing must require admin authentication');

    const invalidOperator = await fetch(`${baseUrl}/api/admin/country-operators/not-a-number/catalog-candidates`, {
      headers: { 'x-admin-api-key': adminKey },
    });
    assert.equal(invalidOperator.status, 400, 'candidate listing must reject invalid operator IDs');

    const missingOperator = await fetch(`${baseUrl}/api/admin/country-operators/${operatorId}/catalog-candidates`, {
      headers: { 'x-admin-api-key': adminKey },
    });
    assert.equal(missingOperator.status, 404, 'candidate listing must return 404 for an unknown operator');

    const unauthenticatedApproval = await fetch(`${baseUrl}/api/admin/country-operators/${operatorId}/approve-sample`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productCatalogId: productId, confirmApproval: true }),
    });
    assert.equal(unauthenticatedApproval.status, 401, 'sample approval must require admin authentication');

    const invalidApproval = await fetch(`${baseUrl}/api/admin/country-operators/not-a-number/approve-sample`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: productId, confirmApproval: true }),
    });
    assert.equal(invalidApproval.status, 400, 'sample approval must reject invalid operator IDs');

    const missingConfirmation = await fetch(`${baseUrl}/api/admin/country-operators/${operatorId}/approve-sample`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: productId }),
    });
    assert.equal(missingConfirmation.status, 400, 'approval must require explicit confirmApproval=true');
    assert.equal((await missingConfirmation.json()).confirmationRequired, true);

    const missingMapping = await fetch(`${baseUrl}/api/admin/country-operators/${operatorId}/approve-sample`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: productId, confirmApproval: true }),
    });
    assert.equal(missingMapping.status, 404, 'approval must reject a product not mapped to the requested operator');

    const counts = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM country_operator_approvals WHERE operator_id = $1) AS approvals,
         (SELECT COUNT(*)::int FROM catalog_verification_audit WHERE operator_id = $1) AS audit_rows`,
      [operatorId],
    );
    assert.equal(counts.rows[0].approvals, 0, 'guard failures must not create approval records');
    assert.equal(counts.rows[0].audit_rows, 0, 'guard failures must not create audit records');
    assert.doesNotMatch(logs, /DTONE_PRODUCT_DETAIL_FETCH_CALLED/, 'guard failures must not reach the provider');

  } finally {
    await db.end();
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
