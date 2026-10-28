'use strict';

// Source-level safeguards for the explicitly invoked DT One pre-production
// test route. These checks do not make any network request or create a top-up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dtone-sandbox-test.js'), 'utf8');

test('DT One sandbox test is restricted to the exact HTTPS pre-production host', () => {
  assert.match(source, /const PREPROD_HOST = 'preprod-dvs-api\\.dtone\\.com'/);
  assert.match(source, /url\\.protocol === 'https:'/);
  assert.match(source, /url\\.hostname === PREPROD_HOST/);
  assert.match(source, /if \\(!isPreproduction\\(\\)\\)/);
});

test('sandbox transaction requires explicit confirmation and a fixed test scenario', () => {
  assert.match(source, /req\\.body\\?\\.confirmSandbox !== true/);
  assert.match(source, /const TEST_PRODUCT_ID = 7194/);
  assert.match(source, /completed: '\\+93700100100'/);
  assert.match(source, /declined: '\\+93700100106'/);
  assert.match(source, /if \\(!testPhone\\)/);
});

test('sandbox result is not acknowledged unless the matching local order update succeeds', () => {
  assert.match(source, /const savedOrder = await pool\\.query\\(/);
  assert.match(source, /if \\(savedOrder\\.rowCount !== 1\\) \\{/);
  assert.match(source, /DT One accepted the sandbox transaction but its result could not be saved/);
  assert.match(source, /sandbox_test_outcome_unknown/);
  assert.match(source, /do not retry blindly/);
});

test('sandbox test route does not create a Stripe payment or perform a refund', () => {
  assert.doesNotMatch(source, /stripe\\.paymentIntents\\.create\\s*\\(/);
  assert.doesNotMatch(source, /stripe\\.checkout\\.sessions\\.create\\s*\\(/);
  assert.doesNotMatch(source, /stripe\\.refunds\\.create\\s*\\(/);
});
