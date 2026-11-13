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
  assert.ok(migration.includes('verified_at TIMESTAMPTZ'));
  assert.ok(migration.includes("CHECK (review_status <> 'approved' OR verified_at IS NOT NULL)"));
});

test('all four activation preflight sandbox checks require approved, recent evidence', () => {
  const start = server.indexOf("app.get('/api/admin/countries/:countryCode/activation-preflight'");
  const end = server.indexOf("app.get('/api/", start + 20);
  assert.ok(start >= 0 && end > start, 'activation preflight route must exist');
  const route = server.slice(start, end);
  const evidenceQueries = route.split('(SELECT COUNT(*) FROM country_sandbox_evidence e').slice(1);
  assert.equal(evidenceQueries.length, 4, 'exactly four sandbox evidence checks must be present');
  for (const name of ['providerConnectivity', 'sampleQuote', 'successCallback', 'failureCallback']) {
    const clause = evidenceQueries.find(query => query.includes("e.test_name='" + name + "'"));
    assert.ok(clause, 'missing sandbox check: ' + name);
    assert.ok(clause.includes("e.review_status='approved'"), name + ' must be independently approved');
    assert.ok(clause.includes("e.verified_at > NOW() - INTERVAL '30 days'"), name + ' approval must be recent');
  }
});

test('sandbox evidence approval requires a separate reviewer credential and records reviewer identity', () => {
  assert.ok(migration.includes('reviewed_by VARCHAR(120)'));
  assert.ok(migration.includes('reviewed_at TIMESTAMPTZ'));
  assert.ok(server.includes('COUNTRY_EVIDENCE_REVIEW_API_KEY'));
  assert.ok(server.includes("req.headers['x-country-evidence-review-key']"));
  assert.ok(server.includes("review_status = 'submitted'"));
  assert.ok(server.includes('req.countryEvidenceReviewerId'));
  assert.ok(server.includes("'/api/admin/countries/:countryCode/sandbox-evidence/:testName/review'"));
});
