// Regression checks for read-only admin checkout readiness diagnostics.
// Source-level checks only: no Stripe, database, refund, or DT One calls are made.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('admin catalog pricing readiness reports every required checkout prerequisite', () => {
  const routeStart = server.indexOf("app.get('/api/admin/catalog/:productId/pricing', requireAdmin");
  const routeEnd = server.indexOf('\n// Admin pricing overview.', routeStart);
  assert.notEqual(routeStart, -1, 'read-only catalog pricing route must exist');
  assert.ok(routeEnd > routeStart, 'pricing route must be bounded');
  const route = server.slice(routeStart, routeEnd);

  for (const check of [
    'wholesalePriceConfigured',
    'pricingSettingsConfigured',
    'productEnabled',
    'stripeConfigured',
    'stripeWebhookConfigured',
    'dtoneConfigured',
    'paymentAndFulfillmentEnvironmentsCompatible',
    'priceCalculationValid',
  ]) {
    assert.match(route, new RegExp(check), `readiness must report ${check}`);
  }
  assert.match(route, /readiness\.safeForRealCheckout\s*=\s*Object\.values\(readiness\)\.every\(Boolean\)/);
});

test('safe checkout readiness cannot pass when any prerequisite is false', () => {
  const routeStart = server.indexOf("app.get('/api/admin/catalog/:productId/pricing', requireAdmin");
  const routeEnd = server.indexOf('\n// Admin pricing overview.', routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /pricingSettingsConfigured:\s*pricing !== null && pricing\.active === true/);
  assert.match(route, /stripeConfigured:\s*Boolean\(stripe\)/);
  assert.match(route, /stripeWebhookConfigured:\s*Boolean\(STRIPE_WEBHOOK_SECRET\)/);
  assert.match(route, /dtoneConfigured:\s*Boolean\(DTONE_API_KEY && DTONE_API_SECRET\)/);
  assert.match(route, /paymentAndFulfillmentEnvironmentsCompatible:\s*arePaymentAndFulfillmentEnvironmentsCompatible\(\)/);
  assert.match(route, /priceCalculationValid/);
});

test('readiness endpoint remains read-only and does not activate products or initiate payment/refund/top-up', () => {
  const routeStart = server.indexOf("app.get('/api/admin/catalog/:productId/pricing', requireAdmin");
  const routeEnd = server.indexOf('\n// Admin pricing overview.', routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /readOnly:\s*true/);
  assert.match(route, /No product, order, payment, or setting was changed/);
  assert.doesNotMatch(route, /UPDATE product_catalog|UPDATE pricing_settings|stripe\.checkout\.sessions\.create|stripe\.refunds\.create|DTONE_API_BASE_URL/);
});

test('source-level readiness tests do not load Stripe or connect to external services', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.match(source, /Source-level checks only/);
  assert.match(source, /fs\.readFileSync/);
  assert.doesNotMatch(source, /require\(['"]stripe['"]\)/);
});
