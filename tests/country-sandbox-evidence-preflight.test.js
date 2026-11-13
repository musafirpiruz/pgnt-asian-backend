'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '029_country_sandbox_evidence.sql'), 'utf8');

test('country sandbox evidence schema requires reviewer metadata for approvals', () => {
  assert.ok(migration.includes('verified_at TIMESTAMPTZ'));
  assert.ok(migration.includes('reviewed_by VARCHAR(120)'));
  assert.ok(migration.includes('reviewed_at TIMESTAMPTZ'));
  assert.ok(migration.includes("CHECK (review_status <> 'approved' OR (verified_at IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))"));
});

test('all four country activation evidence checks require approved recent non-future evidence', () => {
  const start = server.indexOf("app.get('/api/admin/countries/:countryCode/activation-preflight'");
  const end = server.indexOf("app.get('/api/", start + 20);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  const queries = route.split('(SELECT COUNT(*) FROM country_sandbox_evidence e').slice(1);
  assert.equal(queries.length, 4);
  for (const name of ['providerConnectivity', 'sampleQuote', 'successCallback', 'failureCallback']) {
    const clause = queries.find(query => query.includes("e.test_name='" + name + "'"));
    assert.ok(clause, 'missing ' + name);
    assert.ok(clause.includes("e.review_status='approved'"));
    assert.ok(clause.includes("e.verified_at > NOW() - INTERVAL '30 days'"));
    assert.ok(clause.includes('e.verified_at <= NOW()'));
  }
});

test('independent evidence review uses a separate credential and records reviewer identity', () => {
  assert.ok(server.includes('COUNTRY_EVIDENCE_REVIEW_API_KEY'));
  assert.ok(server.includes('COUNTRY_EVIDENCE_REVIEWER_ID'));
  assert.ok(server.includes("req.headers['x-country-evidence-review-key']"));
  assert.ok(server.includes("'x-country-evidence-review-key'"));
  assert.ok(server.includes("req.countryEvidenceReviewerId"));
  assert.ok(server.includes("sandbox-evidence/:testName/review"));
  assert.ok(server.includes("review_status = 'submitted'"));
  assert.ok(server.includes('countryActivated: false'));
});
