'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const lifecycle = fs.readFileSync(path.join(__dirname, '..', 'dtone-ranged-lifecycle.js'), 'utf8');

function section(startToken, endToken) {
  const start = server.indexOf(startToken);
  const end = server.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, 'expected server section is missing');
  return server.slice(start, end);
}

test('ranged discovery exposes only active products with verified destination-amount capability', () => {
  const route = section("app.get('/api/ranged-products'", "app.post('/api/ranged-quotes'");
  assert.match(route, /active = TRUE/);
  assert.match(route, /capability_verified_at IS NOT NULL/);
  assert.match(route, /accepted_calculation_modes \? 'DESTINATION_AMOUNT'/);
  assert.match(route, /PGNT_MIN_AMOUNT/);
  assert.match(route, /PGNT_MAX_AMOUNT/);
  assert.match(route, /paymentCurrency: 'EUR'/);
});

test('ranged quote persists a pending order before creating a non-auto-confirmed provider transaction', () => {
  const route = section("app.post('/api/ranged-quotes'", "app.get('/api/pricing/quote'");
  assert.ok(route.indexOf("await client.query('COMMIT')") < route.indexOf('createRangedTransaction'));
  assert.match(lifecycle, /auto_confirm: false/);
  assert.match(route, /parseRangedWholesalePrice/);
  assert.match(route, /wholesaleCurrency/);
  assert.match(route, /order_access_token_hash/);
  assert.match(route, /Do not retry this request/);
});

test('ranged Stripe checkout authorizes the quote token and uses only the saved EUR charge', () => {
  const route = section("app.post('/api/payments/checkout'", "app.post('/api/admin/stripe-dtone/sandbox-checkout'");
  assert.match(route, /order_access_token_hash = \$2/);
  assert.match(route, /provider_status !== 'CREATED'/);
  assert.match(route, /currency: 'eur'/);
  assert.match(route, /unit_amount: Number\(order\.charge_cents\)/);
  assert.match(route, /ranged-checkout-\$\{orderId\}/);
  assert.match(route, /stripeOutcomeUnknown/);
});

test('paid Stripe processing confirms the exact saved ranged transaction and never creates another', () => {
  const start = server.indexOf('async function processPaidStripeSession');
  const end = server.indexOf('// Sandbox Stripe orders', start);
  assert.ok(start >= 0 && end > start);
  const flow = server.slice(start, end);
  assert.match(flow, /Canonical Stripe payment verification failed/);
  assert.match(flow, /String\(order\.dtone_transaction_id/);
  assert.match(flow, /confirmRangedTransaction/);
  assert.match(flow, /transactionId: ranged\.dtone_transaction_id/);
  assert.doesNotMatch(flow, /createRangedTransaction/);
});

test('ranged callbacks require the exact provider ID and verified paid Stripe evidence', () => {
  const route = section("app.post('/api/dtone/callback'", '// Mark a failed asynchronous Stripe payment');
  assert.match(route, /String\(ranged\.dtone_transaction_id\) !== providerTransactionId/);
  assert.match(route, /!order\.paid_at \|\| !order\.stripe_payment_intent_id/);
  assert.match(route, /staleCallbackIgnored/);
});

test('failed or expired Stripe payment cancels only the saved ranged provider transaction ID', () => {
  const start = server.indexOf('async function markCheckoutPaymentFailed');
  const end = server.indexOf('// Record refund state', start);
  assert.ok(start >= 0 && end > start);
  const flow = server.slice(start, end);
  assert.match(flow, /provider_status === 'CREATED'/);
  assert.match(flow, /transactionId: rangedToCancel\.transactionId/);
  assert.match(flow, /provider_status = 'CANCELLED'/);
  assert.match(flow, /provider_status = 'REVIEW'/);
});

test('provider lifecycle adapter does not automatically retry uncertain requests', () => {
  assert.match(lifecycle, /class DTOneOutcomeUnknownError/);
  assert.match(lifecycle, /throw new DTOneOutcomeUnknownError\(operation, error\)/);
  assert.match(lifecycle, /response\.status === 408/);
  assert.match(lifecycle, /response\.status === 409/);
  assert.match(lifecycle, /response\.status === 429/);
  assert.doesNotMatch(lifecycle, /for\s*\(\s*let attempt|retry\s*\(/i);
});

test('ranged products and quotes require a stable verified operator key', () => {
  const discovery = section("app.get('/api/ranged-products'", "app.post('/api/ranged-quotes'");
  const quote = section("app.post('/api/ranged-quotes'", "app.get('/api/pricing/quote'");
  assert.match(discovery, /operator_key IS NOT NULL/);
  assert.match(discovery, /operatorKey: String\(row\.operator_key\)/);
  assert.match(quote, /req\.body\?\.operatorKey/);
  assert.match(quote, /operator_key = \$3/);
  assert.match(quote, /\[productId, countryIso3, operatorKey\]/);
});

test('migration 019 adds nullable operator identity without activating existing products', () => {
  const migrate = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  assert.match(migrate, /019_dtone_ranged_operator_key/);
  assert.match(migrate, /ADD COLUMN IF NOT EXISTS operator_key VARCHAR\(100\)/);
  assert.match(migrate, /WHERE operator_key IS NOT NULL/);
  assert.doesNotMatch(migrate.slice(migrate.indexOf('019_dtone_ranged_operator_key')), /UPDATE dtone_ranged_products SET active = TRUE/i);
});

test('ranged product activation requires admin auth, explicit confirmation, and canonical provider identity', () => {
  const route = section("app.post('/api/admin/dtone/ranged-products/:productId/activate'", '// Read-only verification of a catalog product');
  assert.match(route, /requireAdmin/);
  assert.match(route, /confirmActivation !== true/);
  assert.match(route, /to_regclass\('country_registry'\)/);
  assert.match(route, /to_regclass\('country_operators'\)/);
  assert.match(route, /o\.provider_operator_id = r\.provider_snapshot->'operator'->>'id'/);
  assert.match(route, /o\.verified_at IS NOT NULL/);
  assert.match(route, /SET operator_key = \$2, active = TRUE/);
  assert.match(route, /FOR UPDATE OF r/);
  assert.match(route, /transactionCreated: false/);
  assert.match(route, /paymentCreated: false/);
});

test('ranged activation fails closed when the canonical country/operator registry is absent', () => {
  const route = section("app.post('/api/admin/dtone/ranged-products/:productId/activate'", '// Read-only verification of a catalog product');
  assert.match(route, /Canonical country\/operator registry or ranged-product migration is not installed/);
  assert.match(route, /No product was changed/);
});