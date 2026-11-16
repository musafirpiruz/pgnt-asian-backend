'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectFixedRechargeProduct } = require('../dtone-fixed-recharge');

function product(overrides = {}) {
  return {
    id: 7194,
    type: 'FIXED_VALUE_RECHARGE',
    service: { id: 1, name: 'Mobile', subservice: { id: 11, name: 'Airtime' } },
    tags: ['AIRTIME'],
    operator: { id: 100, name: 'ATOMA', country: { iso_code: 'AFG' } },
    destination: { unit: 'AFN', amount: 115 },
    prices: {
      wholesale: { unit_type: 'CURRENCY', unit: 'EUR', amount: 1.89 },
      retail: { unit_type: 'CURRENCY', unit: 'EUR', amount: 2.10 },
    },
    ...overrides,
  };
}

test('accepts only a fixed Mobile Airtime recharge with EUR prices and a 75–3000 integer amount', () => {
  const result = inspectFixedRechargeProduct(product(), 'AFN');
  assert.equal(result.eligible, true);
  assert.equal(result.operator, 'ATOMA');
  assert.equal(result.amount, 115);
  assert.equal(result.currency, 'AFN');
  assert.equal(result.wholesaleCents, 189);
  assert.equal(result.retailCents, 210);
});

test('rejects PIN, ranged and payment product types from the fixed recharge catalog', () => {
  for (const type of ['FIXED_VALUE_PIN_PURCHASE', 'RANGED_VALUE_RECHARGE', 'RANGED_VALUE_PAYMENT']) {
    const result = inspectFixedRechargeProduct(product({ type }), 'AFN');
    assert.equal(result.eligible, false, type);
  }
});

test('rejects non-Mobile products and explicitly non-Airtime Mobile subservices', () => {
  assert.equal(inspectFixedRechargeProduct(product({ service: { id: 3, name: 'Utilities' } }), 'AFN').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({ service: { id: 1, name: 'Mobile', subservice: { id: 12, name: 'Bundle' } }, tags: ['BUNDLE'] }), 'AFN').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({ service: { id: 1, name: 'Mobile', subservice: { id: 13, name: 'Data' } }, tags: ['DATA'] }), 'AFN').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({ tags: [] }), 'AFN').eligible, false);
});

test('rejects amounts below 75, above 3000, fractional and missing', () => {
  for (const amount of [74, 3001, 75.5, null, undefined]) {
    const result = inspectFixedRechargeProduct(product({
      destination: { unit: 'AFN', amount },
    }), 'AFN');
    assert.equal(result.eligible, false, String(amount));
  }
});

test('rejects country currency mismatch and prices not explicitly denominated in EUR', () => {
  assert.equal(inspectFixedRechargeProduct(product(), 'PKR').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({
    prices: {
      wholesale: { unit: 'USD', amount: 1.89 },
      retail: { unit: 'EUR', amount: 2.10 },
    },
  }), 'AFN').eligible, false);
});

test('rejects missing or inconsistent EUR prices and missing operator identity', () => {
  assert.equal(inspectFixedRechargeProduct(product({
    prices: {
      wholesale: { unit: 'EUR', amount: 2.10 },
      retail: { unit: 'EUR', amount: 1.89 },
    },
  }), 'AFN').eligible, false);
  assert.equal(inspectFixedRechargeProduct(product({
    operator: { id: 100, name: ' ' },
  }), 'AFN').eligible, false);
});

test('all admin catalog import and price-refresh paths enforce the same fixed Airtime validator', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const refreshStart = server.indexOf("app.post('/api/admin/catalog/:productId/refresh-prices'");
  const importStart = server.indexOf("app.post('/api/admin/catalog/:productId/import'");
  const syncStart = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country'");
  assert.ok(refreshStart >= 0 && importStart > refreshStart && syncStart > importStart);
  const refreshRoute = server.slice(refreshStart, importStart);
  const importRoute = server.slice(importStart, syncStart);
  const syncRoute = server.slice(syncStart, server.indexOf("// Read-only product discovery in the configured DT One environment.", syncStart));
  for (const route of [refreshRoute, importRoute, syncRoute]) {
    assert.match(route, /inspectFixedRechargeProduct\(providerProduct|inspectFixedRechargeProduct\(item/);
    assert.match(route, /fixedRechargeEligibility\.eligible|inspected\.eligible/);
  }
});


test('bulk country catalog imports persist fresh DT One price evidence while keeping products disabled', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = server.indexOf("app.post('/api/admin/dtone/catalog/sync-country'");
  const end = server.indexOf("// Read-only product discovery in the configured DT One environment.", start);
  assert.ok(start >= 0 && end > start, 'bulk country catalog route must exist');
  const route = server.slice(start, end);
  assert.match(route, /provider_price_verified_at, provider_price_source/);
  assert.match(route, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, NOW\(\), 'dtone_api', \$5, 0, FALSE, NOW\(\)\)/);
  assert.match(route, /provider_price_product_id, active/);
  assert.match(route, /provider_price_source = 'dtone_api'/);
  assert.match(route, /productsRemainDisabled: true/);
});
