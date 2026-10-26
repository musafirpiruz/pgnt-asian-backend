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
