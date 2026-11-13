'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'migrations', '029_country_sandbox_evidence.sql'),
  'utf8'
);

test('country sandbox evidence schema supports independently verified approvals', () => {
  assert.match(migration, /verified_at TIMESTAMPTZ/);
  assert.match(migration, /CHECK \(review_status <> 'approved' OR verified_at IS NOT NULL\)/);
});

test('all four activation preflight sandbox checks require approved, recent evidence', () => {
  const start = server.indexOf("app.get('/api/admin/countries/:countryCode/activation-preflight'");
  const end = server.indexOf("app.get('/api/", start + 20);
  assert.ok(start >= 0 && end > start, 'activation preflight route must exist');
  const route = server.slice(start, end);
  for (const name of ['providerConnectivity', 'sampleQuote', 'successCallback', 'failureCallback']) {
    const at = route.indexOf("e.test_name='" + name + "'");
    assert.ok(at >= 0, 'missing sandbox check: ' + name);
    const clause = route.slice(Math.max(0, at - 220), at + name.length + 30);
    assert.match(clause, /e\.review_status='approved'/, name + ' must be independently approved');
    assert.match(clause, /e\.verified_at > NOW\(\) - INTERVAL '30 days'/, name + ' approval must be recent');
  }
});
