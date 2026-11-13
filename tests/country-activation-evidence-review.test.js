'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('every sandbox evidence item in country activation preflight must be independently approved and recent', () => {
  const routeStart = server.indexOf("app.get('/api/admin/countries/:countryCode/activation-preflight'");
  assert.ok(routeStart >= 0, 'read-only country activation preflight route must exist');
  const routeEnd = server.indexOf('// Read-only wallet integrity diagnostics.', routeStart);
  assert.ok(routeEnd > routeStart, 'activation preflight route must have a bounded source section');
  const route = server.slice(routeStart, routeEnd);

  for (const testName of [
    'providerConnectivity',
    'sampleQuote',
    'successCallback',
    'failureCallback',
  ]) {
    const escaped = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const subquery = new RegExp(
      `SELECT COUNT\\(\\*\\) FROM country_sandbox_evidence e[\\s\\S]*?e\\.test_name='${escaped}'[\\s\\S]*?\\)::int AS sandbox_`,
      'i'
    );
    const match = route.match(subquery);
    assert.ok(match, `missing sandbox evidence count for ${testName}`);
    assert.match(match[0], /e\.passed\s*=\s*TRUE/i, `${testName} must have passed`);
    assert.match(match[0], /e\.review_status\s*=\s*'approved'/i, `${testName} must be independently approved`);
    assert.match(match[0], /e\.verified_at\s*>\s*NOW\(\)\s*-\s*INTERVAL\s+'30 days'/i, `${testName} evidence must be recent`);
  }
});

test('submitted or rejected sandbox evidence cannot count as country readiness', () => {
  const routeStart = server.indexOf("app.get('/api/admin/countries/:countryCode/activation-preflight'");
  const routeEnd = server.indexOf('// Read-only wallet integrity diagnostics.', routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.equal((route.match(/e\.review_status='approved'/g) || []).length, 4);
  assert.match(route, /Submitted evidence does not count as verified until an independent review approves it/);
});
