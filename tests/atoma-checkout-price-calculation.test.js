'use strict';

// Focused regression tests for the documented ATOMA 115 AFN quote.
// Offline only: no server boot, database, Stripe, or DT One calls.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function quoteCents({ wholesaleCents, appFeeCents, stripePercent, stripeFixedCents }) {
  const targetNetCents = wholesaleCents + appFeeCents;
  const rate = stripePercent / 100;
  let finalCents = Math.ceil((targetNetCents + stripeFixedCents) / (1 - rate));
  let stripeFeeCents = Math.ceil(finalCents * rate) + stripeFixedCents;
  while (finalCents - stripeFeeCents < targetNetCents) {
    finalCents += 1;
    stripeFeeCents = Math.ceil(finalCents * rate) + stripeFixedCents;
  }
  return { finalCents, stripeFeeCents, retainedCents: finalCents - stripeFeeCents };
}

test('ATOMA 115 AFN proposed EUR quote covers wholesale, app fee and estimated Stripe fee', () => {
  const quote = quoteCents({
    wholesaleCents: 189,
    appFeeCents: 49,
    stripePercent: 1.5,
    stripeFixedCents: 25,
  });
  assert.equal(quote.finalCents, 268, 'proposed customer quote must be EUR 2.68');
  assert.equal(quote.stripeFeeCents, 30, 'estimated Stripe fee must be EUR 0.30');
  assert.equal(quote.retainedCents, 238, 'net must cover EUR 1.89 wholesale + EUR 0.49 app fee');
});

test('production gross-up uses verified wholesale cost and corrects rounding shortfalls', () => {
  const start = server.indexOf('function calculateFinalPrice(product, pricing) {');
  const end = server.indexOf('// Get a quote using server-side product and pricing data.', start);
  assert.notEqual(start, -1, 'production price calculator must exist');
  assert.ok(end > start, 'production calculator must have a bounded section');
  const source = server.slice(start, end);
  assert.match(source, /product\.wholesalePriceCents/);
  assert.match(source, /const targetNetCents = basePriceCents \+ feeCents/);
  assert.match(source, /Math\.ceil\(finalPriceCents \* stripeRate\) \+ pricing\.stripeFixedFeeCents/);
  assert.match(source, /while \(finalPriceCents - estimatedStripeFeeCents < targetNetCents\)/);
});

test('read-only diagnostic separates provider catalog retail from calculated checkout quote', () => {
  const start = server.indexOf("app.get('/api/admin/catalog/:productId/pricing', requireAdmin");
  const end = server.indexOf('\n// Admin pricing overview.', start);
  assert.notEqual(start, -1, 'read-only pricing diagnostic must exist');
  assert.ok(end > start, 'pricing diagnostic must have a bounded section');
  const route = server.slice(start, end);
  assert.match(route, /estimatedCustomerPriceCents:\s*preview\.finalPriceCents/);
  assert.match(route, /catalogRetailPriceEur:/);
  assert.match(route, /calculatedPriceMinusCatalogRetailEur:/);
  assert.match(route, /catalogRetailPriceMatchesCalculatedPrice:/);
  assert.match(route, /readOnly:\s*true/);
  assert.match(route, /No product, order, payment, or setting was changed/);
  assert.doesNotMatch(route, /UPDATE product_catalog|UPDATE pricing_settings|stripe\.checkout\.sessions\.create|stripe\.refunds\.create/);
});

test('rounding invariant holds across representative costs, fees, and Stripe rates', () => {
  for (let wholesaleCents = 1; wholesaleCents <= 500; wholesaleCents += 7) {
    for (let appFeeCents = 0; appFeeCents <= 100; appFeeCents += 13) {
      for (const stripePercent of [0, 1.5, 2.9, 5]) {
        const quote = quoteCents({ wholesaleCents, appFeeCents, stripePercent, stripeFixedCents: 25 });
        assert.ok(quote.finalCents > 0);
        assert.ok(quote.retainedCents >= wholesaleCents + appFeeCents,
          `net must cover costs (wholesale=${wholesaleCents}, appFee=${appFeeCents}, stripeRate=${stripePercent})`);
      }
    }
  }
});
