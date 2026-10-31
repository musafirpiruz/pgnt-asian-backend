// Source-level safety checks for read-only wallet integrity diagnostics.
// No database, Stripe, DT One, wallet write, or external service is used.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('wallet diagnostics are admin-authenticated and read-only', () => {
  const start = server.indexOf("app.get('/api/admin/wallets/diagnostics', requireAdmin");
  const end = server.indexOf('\n// Customer and admin support-ticket API routes.', start);
  assert.notEqual(start, -1, 'admin wallet diagnostics route must exist');
  assert.ok(end > start, 'wallet diagnostics route must be bounded');
  const route = server.slice(start, end);

  assert.match(route, /readOnly:\s*true/);
  assert.match(route, /walletApiEnabled:\s*false/);
  assert.match(route, /financialWritesEnabled:\s*false/);
  assert.match(route, /readyForWalletActivation:\s*false/);
  assert.match(route, /authenticatedCustomerWalletApiNotImplemented/);
  assert.match(route, /walletFinancialWritesRemainDisabledPendingLedgerDesignAndReview/);
  assert.match(route, /No wallet balance, ledger, payment, refund, or top-up was changed/);
  assert.doesNotMatch(route, /INSERT\s+INTO|UPDATE\s+wallets|UPDATE\s+wallet_transactions|DELETE\s+FROM|stripe\.refunds|stripe\.checkout|DTONE_API_BASE_URL/i);
});

test('wallet diagnostics inspect duplicate references and latest ledger reconciliation', () => {
  const start = server.indexOf("app.get('/api/admin/wallets/diagnostics', requireAdmin");
  const end = server.indexOf('\n// Customer and admin support-ticket API routes.', start);
  const route = server.slice(start, end);

  assert.match(route, /GROUP BY wallet_id, reference_type, reference_id/);
  assert.match(route, /HAVING COUNT\(\*\) > 1/);
  assert.match(route, /ORDER BY wt\.created_at DESC, wt\.id DESC/);
  assert.match(route, /latest\.balance_after_cents <> w\.balance_cents/);
  assert.match(route, /transactionReferenceUnique/);
  assert.match(route, /walletLedgerBalancesReconcile/);
});

test('wallet diagnostics disclose counts only and do not return customer identifiers', () => {
  const start = server.indexOf("app.get('/api/admin/wallets/diagnostics', requireAdmin");
  const end = server.indexOf('\n// Customer and admin support-ticket API routes.', start);
  const route = server.slice(start, end);

  assert.match(route, /walletCount:\s*Number\(row\.wallet_count\)/);
  assert.match(route, /transactionCount:\s*Number\(row\.transaction_count\)/);
  assert.doesNotMatch(route, /SELECT\s+.*phone|SELECT\s+.*email|wallets\.user_id|RETURNING\s+.*user_id/is);
});
