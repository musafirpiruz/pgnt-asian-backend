'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('operator list only exposes operators with active, verified, sellable DT One products', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf("app.get('/api/countries/:countryCode/operators/:operatorKey/products'", start);
  assert.ok(start >= 0 && end > start, 'operator registry route must exist');
  const route = server.slice(start, end);
  for (const condition of [
    'c.status = \'active\'',
    'o.active = TRUE',
    'o.verified_at IS NOT NULL',
    'cop.active = TRUE',
    'cop.verified_at IS NOT NULL',
    'p.active = TRUE',
    'p.product_id IS NOT NULL',
    'p.wholesale_price_eur_cents IS NOT NULL',
    'p.wholesale_price_eur_cents > 0',
    'p.currency = c.destination_currency',
  ]) {
    assert.ok(route.includes(condition), 'missing sellability condition: ' + condition);
  }
});
