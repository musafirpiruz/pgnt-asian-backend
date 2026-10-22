// Static safety regression tests for the DT One sandbox route.
// These tests do not send requests to DT One or create transactions.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'dtone-sandbox-test.js'),
  'utf8'
);

test('sandbox route is restricted to the exact DT One pre-production host', () => {
  assert.match(source, /const PREPROD_HOST = 'preprod-dvs-api\.dtone\.com'/);
  assert.match(source, /url\.hostname === PREPROD_HOST/);
  assert.match(source, /url\.protocol === 'https:'/);
  assert.match(source, /url\.pathname === '' \|\| url\.pathname === '\/'/);
});

test('sandbox transaction requires explicit confirmation and a named scenario', () => {
  assert.match(source, /req\.body\?\.confirmSandbox !== true/);
  assert.match(source, /completed: '\+93700100100'/);
  assert.match(source, /declined: '\+93700100106'/);
  assert.match(source, /const TEST_PRODUCT_ID = 7194/);
  assert.match(source, /product_id: TEST_PRODUCT_ID/);
});

test('sandbox route does not create a Stripe payment or activate catalog products', () => {
  assert.doesNotMatch(source, /stripe\.checkout\.sessions\.create/);
  assert.doesNotMatch(source, /UPDATE\s+product_catalog\s+SET\s+active\s*=\s*TRUE/i);
  assert.match(source, /No Stripe payment was created/);
});

test('unknown sandbox outcomes are retained for review rather than blindly retried', () => {
  assert.match(source, /sandbox_test_outcome_unknown/);
  assert.match(source, /do not retry blindly/i);
  assert.match(source, /Check the saved order and DT One dashboard/i);
});
