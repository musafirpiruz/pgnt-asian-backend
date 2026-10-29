'use strict';

// Source-level safeguards for the explicitly invoked DT One pre-production
// test route. These checks do not make any network request or create a top-up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dtone-sandbox-test.js'), 'utf8');

test('DT One sandbox test is restricted to the exact HTTPS pre-production host', () => {
  assert.ok(source.includes("const PREPROD_HOST = 'preprod-dvs-api.dtone.com'"));
  assert.ok(source.includes("url.protocol === 'https:'"));
  assert.ok(source.includes("url.hostname === PREPROD_HOST"));
  assert.ok(source.includes('if (!isPreproduction())'));
});

test('sandbox transaction requires explicit confirmation and a fixed test scenario', () => {
  assert.ok(source.includes('req.body?.confirmSandbox !== true'));
  assert.ok(source.includes('const TEST_PRODUCT_ID = 7194'));
  assert.ok(source.includes("completed: '+93700100100'"));
  assert.ok(source.includes("declined: '+93700100106'"));
  assert.ok(source.includes('if (!testPhone)'));
});

test('sandbox result is not acknowledged unless the matching local order update succeeds', () => {
  assert.ok(source.includes('const savedOrder = await pool.query('));
  assert.ok(source.includes('if (savedOrder.rowCount !== 1) {'));
  assert.ok(source.includes('DT One accepted the sandbox transaction but its result could not be saved'));
  assert.ok(source.includes("WHERE order_id = $3 AND status IN ('processing_topup', 'topup_submitted')"),
    'provider response must not overwrite callback terminal/review statuses');
  assert.ok(source.includes("dtone_status = 'sandbox_test_outcome_unknown'"));
  assert.ok(source.includes('do not retry blindly'));
});

test('sandbox test route does not create a Stripe payment or perform a refund', () => {
  assert.ok(!source.includes('stripe.paymentIntents.create('));
  assert.ok(!source.includes('stripe.checkout.sessions.create('));
  assert.ok(!source.includes('stripe.refunds.create('));
});
