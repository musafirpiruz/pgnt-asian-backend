'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRangedCheckoutService } = require('../ranged-checkout-service');

function deps(overrides = {}) {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes('FROM dtone_ranged_products')) {
        return { rowCount: 1, rows: [{
          dtone_product_id: '98765',
          country_iso_code: 'AFG',
          operator_name: 'Test Network',
          destination_currency: 'AFN',
          min_amount: '75',
          max_amount: '3000',
          amount_increment: '5',
          accepted_calculation_modes: ['DESTINATION_AMOUNT'],
          capability_verified_at: new Date().toISOString(),
          active: true,
        }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async query(sql, values) { queries.push({ sql, values }); return { rowCount: 1, rows: [] }; },
  };
  const stripe = {
    checkout: { sessions: { async create(params, options) {
      return { id: 'cs_test_ranged_1', url: 'https://checkout.stripe.test/session' };
    } } },
  };
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    return {
    ok: true,
    async text() {
      return JSON.stringify({
        id: 123456789,
        external_id: request.external_id,
        product: { id: request.product_id },
        status: { message: 'CREATED' },
        confirmation_expiration_date: new Date(Date.now() + 600000).toISOString(),
        requested_values: { destination: { amount: 150, unit: 'AFN', unit_type: 'CURRENCY' } },
        prices: { wholesale: { amount: 1.89, fee: 0, unit: 'EUR', unit_type: 'CURRENCY' } },
      });
    },
  };
  };
  const service = createRangedCheckoutService({
    pool, stripe,
    dtoneBaseUrl: 'https://preprod-dvs-api.dtone.com',
    dtoneTransactionPath: '/v1/async/transactions',
    dtoneAuthHeader: 'Basic test',
    callbackUrl: 'https://example.com/api/dtone/callback',
    appBaseUrl: 'https://example.com',
    getPricingSettings: async () => ({ feeCents: 49, stripeFeePercent: 1.5, stripeFixedFeeCents: 25 }),
    validatePhone: (phone, country) => ({ valid: true, phone: '700100100', country, currency: 'AFN' }),
    countryCurrency: () => 'AFN',
    normalizePhone: (phone) => phone,
    supportedCountries: { AF: { callingCode: '+93' } },
    formatEuro: (cents) => `€${(cents / 100).toFixed(2)}`,
    ...overrides,
  });
  return { service, queries, restoreFetch() { global.fetch = originalFetch; } };
}

test('ranged checkout rejects an unsupported amount before any provider or payment request', async () => {
  const { service, restoreFetch } = deps();
  try {
    await assert.rejects(
      service({ country: 'AF', phone: '700100100', productId: '98765', amount: 151 }),
      /outside the verified DT One range or increment/
    );
  } finally { restoreFetch(); }
});

test('ranged checkout obtains a CREATED EUR quote, stores RANGED identity, and creates EUR Stripe session', async () => {
  const { service, queries, restoreFetch } = deps();
  try {
    const result = await service({
      country: 'AF', phone: '700100100', productId: '98765', amount: 150,
    });
    assert.equal(result.paymentCurrency, 'EUR');
    assert.equal(result.destinationAmount, 150);
    assert.equal(result.destinationCurrency, 'AFN');
    assert.equal(result.providerStatus, 'CREATED');
    assert.match(result.checkoutUrl, /^https:\/\//);
    assert.ok(queries.some((entry) => entry.sql.includes("'RANGED'")));
    assert.ok(queries.some((entry) => entry.sql.includes('dtone_ranged_transactions')));
    assert.ok(queries.some((entry) => entry.sql.includes('stripe_session_id')));
  } finally { restoreFetch(); }
});

test('ranged checkout service is distinct from the fixed checkout endpoint', () => {
  const fs = require('node:fs');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert.match(server, /api\/payments\/ranged-checkout/);
  assert.match(server, /RANGED_CHECKOUT_ENABLED !== 'true'/);
  assert.match(server, /api\/payments\/checkout/);
});

test('paid ranged webhook claims CREATED to CONFIRMING and commits before DT One confirmation', () => {
  const fs = require('node:fs');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const start = server.indexOf('async function processPaidRangedOrder');
  const end = server.indexOf('async function processPaidStripeSession', start);
  assert.ok(start >= 0 && end > start, 'ranged webhook processor must exist');
  const handler = server.slice(start, end);
  const claim = handler.indexOf("SET provider_status='CONFIRMING'");
  const commit = handler.indexOf("await client.query('COMMIT')", claim);
  const providerCall = handler.indexOf('providerResponse = await fetch', commit);
  assert.ok(claim >= 0 && commit > claim && providerCall > commit,
    'durable confirmation claim must commit before provider request');
  assert.match(handler, /provider_status='REVIEW'/);
  assert.match(handler, /verifyRangedConfirmation/);
  assert.match(handler, /confirmation outcome is unknown/);
});

test('duplicate Stripe webhook never restarts ranged confirmation and fixed fulfillment remains separate', () => {
  const fs = require('node:fs');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const start = server.indexOf('async function processPaidStripeSession');
  const end = server.indexOf('// =====================================================', start);
  const handler = server.slice(start, end);
  assert.match(handler, /session\.payment_status !== 'paid'/);
  assert.match(handler, /session\.currency !== 'eur'/);
  assert.match(handler, /order\.fulfillment_type === 'RANGED'/);
  assert.match(handler, /Do not restart a ranged provider confirmation on a duplicate webhook/);
  assert.doesNotMatch(handler, /resumeRangedProcessing/);
  assert.match(handler, /product_catalog/);
  assert.match(server, /RANGED_CHECKOUT_ENABLED !== 'true'/);
});


test('authenticated DT One callbacks verify ranged identity and reconcile ranged transaction status', () => {
  const fs = require('node:fs');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const start = server.indexOf("app.post('/api/dtone/callback'");
  const end = server.indexOf('// Mark a failed asynchronous Stripe payment', start);
  assert.ok(start >= 0 && end > start, 'DT One callback route must exist');
  const callback = server.slice(start, end);
  assert.match(callback, /order\.fulfillment_type === 'RANGED'/);
  assert.match(callback, /dtone_transaction_id/);
  assert.match(callback, /ranged_product_id/);
  assert.match(callback, /Ranged callback identity does not match/);
  assert.match(callback, /UPDATE dtone_ranged_transactions/);
  assert.match(callback, /'COMPLETED' : 'FAILED'/);
});


test('ranged checkout fails closed when DT One quote identity is inconsistent', async () => {
  const { service, queries, restoreFetch } = deps();
  const originalStripe = service;
  global.fetch = async () => ({
    ok: true,
    async text() {
      return JSON.stringify({
        id: 123456789,
        external_id: 'WRONG-ORDER',
        product: { id: 98765 },
        status: { message: 'CREATED' },
        confirmation_expiration_date: new Date(Date.now() + 600000).toISOString(),
        requested_values: { destination: { amount: 150, unit: 'AFN', unit_type: 'CURRENCY' } },
        prices: { wholesale: { amount: 1.89, fee: 0, unit: 'EUR', unit_type: 'CURRENCY' } },
      });
    },
  });
  try {
    await assert.rejects(
      originalStripe({ country: 'AF', phone: '700100100', productId: '98765', amount: 150 }),
      /identity|external/i
    );
    assert.equal(queries.some((entry) => entry.sql.includes('INSERT INTO orders')), false);
  } finally { restoreFetch(); }
});

test('ranged checkout marks provider quote for review when Stripe Checkout creation fails', async () => {
  const stripe = { checkout: { sessions: { async create() { throw new Error('Stripe unavailable'); } } } };
  const { service, queries, restoreFetch } = deps({ stripe });
  try {
    await assert.rejects(
      service({ country: 'AF', phone: '700100100', productId: '98765', amount: 150 }),
      /Stripe unavailable/
    );
    assert.ok(queries.some((entry) => entry.sql.includes("provider_status='REVIEW'")));
    assert.ok(queries.some((entry) => entry.sql.includes("status='payment_failed'")));
  } finally { restoreFetch(); }
});
