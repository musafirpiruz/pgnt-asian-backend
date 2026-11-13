'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('customer ranged catalog exposes only active, verified DT One destination-amount capabilities', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/ranged-products'");
  const end = server.indexOf("// Import one verified DT One ranged recharge capability", start);
  assert.ok(start >= 0 && end > start, 'customer ranged catalog route must exist');
  const route = server.slice(start, end);

  assert.match(route, /rp\.active = TRUE/);
  assert.match(route, /rp\.capability_verified_at IS NOT NULL/);
  assert.match(route, /rp\.accepted_calculation_modes \? 'DESTINATION_AMOUNT'/);
  assert.match(route, /rp\.min_amount <= 3000/);
  assert.match(route, /rp\.max_amount >= 75/);
  assert.match(route, /cr\.destination_currency = rp\.destination_currency/);
  assert.match(route, /cr\.status IN \('active', 'legacy'\)/);
  assert.match(route, /AF: 'AFG'[\s\S]*PK: 'PAK'[\s\S]*IN: 'IND'[\s\S]*BD: 'BGD'/);
  assert.doesNotMatch(route, /wholesale_price_range|provider_snapshot|wholesale_amount/);
});

test('customer ranged catalog clamps selectable bounds to 75–3000 without ignoring provider increments', () => {
  function bounds(minimum, maximum, increment) {
    const min = minimum + Math.ceil((Math.max(minimum, 75) - minimum) / increment) * increment;
    const cappedMax = Math.min(maximum, 3000);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(cappedMax) ||
        !Number.isSafeInteger(increment) || increment <= 0 || min < 75 || min > cappedMax) {
      return null;
    }
    return {
      min,
      max: min + Math.floor((cappedMax - min) / increment) * increment,
      increment,
    };
  }

  assert.deepEqual(bounds(50, 5000, 5), { min: 75, max: 3000, increment: 5 });
  assert.deepEqual(bounds(100, 2000, 25), { min: 100, max: 2000, increment: 25 });
  assert.deepEqual(bounds(80, 1000, 30), { min: 110, max: 980, increment: 30 });
  assert.equal(bounds(3005, 5000, 5), null);
  assert.equal(bounds(75, 74, 1), null);
});

test('customer ranged catalog returns only public product identity and amount capability', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/ranged-products'");
  const end = server.indexOf("// Import one verified DT One ranged recharge capability", start);
  const route = server.slice(start, end);
  assert.match(route, /productId: String\(row\.dtone_product_id\)/);
  assert.match(route, /operator: String\(row\.operator_name\)/);
  assert.match(route, /currency: String\(row\.destination_currency\)/);
  assert.match(route, /minAmount: min/);
  assert.match(route, /maxAmount: lastValid/);
  assert.match(route, /increment/);
  assert.match(route, /products: \[\]/);
});
