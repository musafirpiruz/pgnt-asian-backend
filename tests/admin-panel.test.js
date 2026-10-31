'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-panel.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

test('simple admin dashboard inline JavaScript has valid syntax', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'dashboard should have one inline script');
  assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
});

test('admin dashboard only calls read-only check endpoints', () => {
  assert.match(html, /\/api\/admin\/orders\/review/);
  assert.match(html, /payment-status/);
  assert.match(html, /encodeURIComponent\(orderId\)/);
  assert.match(html, /\/api\/admin\/dtone\/transaction-status\?external_id=/);
  assert.match(html, /\/api\/admin\/pricing/);
  assert.doesNotMatch(html, /\/api\/admin\/orders\/[^'"]+\/refund/);
  assert.doesNotMatch(html, /sandbox-checkout|runSandbox|importCatalogProduct/);
});

test('dashboard route serves the separate HTML with no-store and restrictive CSP', () => {
  assert.match(server, /app\.get\('\/admin', \(req, res\) => \{/);
  assert.match(server, /Cache-Control', 'no-store'/);
  assert.match(server, /Content-Security-Policy/);
  assert.match(server, /admin-panel\.html/);
});

test('DT One status lookup rejects whitespace in external IDs', () => {
  assert.ok(server.includes("/\\s/.test(externalId)"));
});

test('every dashboard data endpoint is a GET protected by admin authentication', () => {
  assert.ok(server.includes("app.get('/api/admin/orders/review', requireAdmin,"));
  assert.ok(server.includes("app.get('/api/admin/orders/:orderId/payment-status', requireAdmin,"));
  assert.ok(server.includes("app.get('/api/admin/dtone/transaction-status', requireAdmin,"));
  assert.ok(server.includes("app.get('/api/admin/pricing', requireAdmin,"));
});

test('admin key is not persisted in browser storage', () => {
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie/);
  assert.match(html, /x-admin-api-key/);
  assert.match(html, /clearKey/);
});

test('README explains the simple admin workflow and read-only scope', () => {
  assert.match(readme, /Simple Admin Check Dashboard/);
  assert.match(readme, /\/admin/);
  assert.match(readme, /does not issue refunds/);
});

test('wallet migration preflight dashboard is read-only and uses the ephemeral admin key', () => {
  assert.match(html, /loadWalletPreflight/);
  assert.match(html, /\/api\/admin\/wallets\/migration-preflight/);
  assert.match(html, /duplicateReferenceGroups/);
  assert.match(html, /duplicateWalletOwnerCurrencyGroups/);
  assert.match(html, /schemaChangesApplied/);
  assert.match(html, /financialWritesEnabled/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\\.cookie/);
  assert.ok(server.includes("app.get('/api/admin/wallets/migration-preflight', requireAdmin,"));
});


test('wallet migration preflight API explicitly preserves every financial safety lock', () => {
  const start = server.indexOf("app.get('/api/admin/wallets/migration-preflight', requireAdmin");
  const end = server.indexOf("// Customer and admin support-ticket API routes", start);
  assert.ok(start >= 0 && end > start, 'read-only wallet migration preflight route should exist');
  const route = server.slice(start, end);

  assert.match(route, /readOnly:\s*true/);
  assert.match(route, /schemaChangesApplied:\s*false/);
  assert.match(route, /walletApiEnabled:\s*false/);
  assert.match(route, /financialWritesEnabled:\s*false/);
  assert.match(route, /retentionPolicyAndLedgerIdentityMustBeApprovedBeforeMigration/);
  assert.match(route, /SELECT[\s\S]*FROM wallet_transactions/);
  assert.doesNotMatch(route, /\b(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE)\b/i);
  assert.match(route, /No schema, wallet, ledger, payment, refund, or top-up data was changed/);
});

test('wallet preflight dashboard requests diagnostics without exposing a write action', () => {
  const start = html.indexOf("document.getElementById('loadWalletPreflight').addEventListener");
  assert.ok(start >= 0, 'wallet preflight button handler should exist');
  const handler = html.slice(start, start + 2600);
  const requestStart = html.indexOf('async function adminRequest(url)');
  const requestHelper = html.slice(requestStart, requestStart + 900);
  assert.ok(handler.includes('/api/admin/wallets/migration-preflight'));
  assert.ok(requestHelper.includes("method:'GET'"));
  assert.doesNotMatch(handler + requestHelper, /method:\s*'(?:POST|PUT|PATCH|DELETE)'/);
});

test('referral admin report is read-only and uses the existing admin-authenticated GET endpoint', () => {
  assert.match(html, /loadReferralReport/);
  assert.match(html, /\/api\/admin\/referrals/);
  assert.match(server, /app\.get\('\/api\/admin\/referrals', requireAdmin/);
  assert.match(html, /یوازې لوستل/);
  assert.doesNotMatch(html, /fetch\('\/api\/admin\/referrals'\s*,\s*\{\s*method\s*:\s*'POST'/);
});

test('referral code creation UI only sends the fixed seven-cent reward and never activates a code', () => {
  assert.match(html, /createReferralCode/);
  assert.match(html, /adminPost\('\/api\/admin\/referrals\/codes'/);
  assert.match(html, /rewardEurCents:7/);
  assert.match(server, /VALUES \(\$1,\$2,\$3,\$4,\$5,FALSE\)/);
  assert.doesNotMatch(html, /active\s*:\s*true|rewardEurCents\s*:\s*(?!7\b)\d+/);
});
