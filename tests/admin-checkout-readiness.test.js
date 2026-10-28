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


test('sandbox checkout requires Stripe test mode, DT One pre-production, and explicit confirmation', () => {
  const routeStart = server.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout', express.json(), requireAdmin");
  const routeEnd = server.indexOf("\n// ", routeStart + 1);
  assert.notEqual(routeStart, -1, 'admin sandbox checkout route must exist');
  const route = server.slice(routeStart, routeEnd > routeStart ? routeEnd : routeStart + 6000);
  assert.match(route, /STRIPE_SECRET_KEY\.startsWith\('sk_test_'\)/);
  assert.match(route, /isDtOnePreproductionConfigured\(\)/);
  assert.match(route, /req\.body\?\.confirmSandbox !== true/);
  assert.match(route, /sandboxOnly:\s*true/);
  assert.match(route, /productRemainsInactive:\s*true/);
  assert.match(route, /stripe\.checkout\.sessions\.create/);
  assert.match(route, /Successful payment will submit one DT One pre-production sandbox transaction/);
});

test('catalog price discrepancy is explicitly reported and cannot be mistaken for checkout price', () => {
  const routeStart = server.indexOf("app.get('/api/admin/catalog/:productId/pricing', requireAdmin");
  const routeEnd = server.indexOf('\n// Admin pricing overview.', routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /catalogRetailPriceEur/);
  assert.match(route, /calculatedPriceMinusCatalogRetailEur/);
  assert.match(route, /catalogRetailPriceMatchesCalculatedPrice/);
  assert.match(route, /catalogRetailPriceEur is a separate catalog value/);
  assert.match(route, /any difference must be reviewed before product activation/);
});


test('verified DT One import keeps provider wholesale and retail prices in separate fields and product disabled', () => {
  const routeStart = server.indexOf("app.post('/api/admin/catalog/:productId/import', requireAdmin");
  const routeEnd = server.indexOf("\n\n// Read-only product discovery", routeStart);
  assert.notEqual(routeStart, -1, 'verified catalog import route must exist');
  assert.ok(routeEnd > routeStart, 'catalog import route must be bounded');
  const route = server.slice(routeStart, routeEnd);

  assert.match(route, /providerProduct\.prices\?\.retail\?\.amount/);
  assert.match(route, /providerProduct\.prices\?\.wholesale\?\.amount/);
  assert.match(route, /price_eur_cents,\s*wholesale_price_eur_cents/);
  assert.match(route, /\[country, operator, amountValue, currency, productId, retailCents, wholesaleCents\]/);
  assert.match(route, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, 0, FALSE, NOW\(\)\)/);
  assert.match(route, /activationChanged:\s*false/);
  assert.match(route, /transactionCreated:\s*false/);
  assert.match(route, /alreadyRegistered:\s*true/);
  assert.match(route, /conflict:\s*true/);
});

test('catalog import refuses to overwrite existing product prices and requires manual conflict review', () => {
  const routeStart = server.indexOf("app.post('/api/admin/catalog/:productId/import', requireAdmin");
  const routeEnd = server.indexOf("\n\n// Read-only product discovery", routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.match(route, /SELECT id, product_id, country, operator, amount, currency, active FROM product_catalog WHERE product_id = \$1 FOR UPDATE/);
  assert.match(route, /No database values were changed/);
  assert.match(route, /Manual review is required; no data was changed/);
  assert.doesNotMatch(route, /UPDATE product_catalog/);
});


test('explicit catalog price refresh is admin-only, confirmed, provider-verified, and disabled-only', () => {
  const routeStart = server.indexOf("app.post('/api/admin/catalog/:productId/refresh-prices', express.json(), requireAdmin");
  const routeEnd = server.indexOf('// Import one verified DT One product into the local catalog as DISABLED.', routeStart);
  assert.notEqual(routeStart, -1, 'safe price refresh route must exist');
  assert.ok(routeEnd > routeStart, 'price refresh route must be bounded');
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /confirmPriceRefresh !== true/);
  assert.match(route, /SELECT id, product_id, country, operator, amount, currency, price_eur_cents, wholesale_price_eur_cents, active FROM product_catalog WHERE product_id = \$1 FOR UPDATE/);
  assert.match(route, /current\.active === true/);
  assert.match(route, /providerProduct\.prices\?\.retail\?\.amount/);
  assert.match(route, /providerProduct\.prices\?\.wholesale\?\.amount/);
  assert.match(route, /identityMismatch: true/);
  assert.match(route, /SET price_eur_cents = \$1, wholesale_price_eur_cents = \$2, updated_at = NOW\(\)/);
  assert.match(route, /WHERE id = \$3 AND active = FALSE/);
  assert.match(route, /activationChanged: false/);
  assert.match(route, /pricingSettingsChanged: false/);
  assert.match(route, /transactionCreated: false/);
  assert.match(route, /paymentCreated: false/);
  assert.doesNotMatch(route, /UPDATE pricing_settings|stripe\.checkout\.sessions\.create|stripe\.refunds\.create/);
});
