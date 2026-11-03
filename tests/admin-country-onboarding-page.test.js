'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'admin-country-onboarding.html'), 'utf8');

test('country onboarding page is served with a restrictive same-origin policy', () => {
  assert.match(serverSource, /app\.get\('\/admin-countries'/);
  assert.match(serverSource, /admin-country-onboarding\.html/);
  assert.match(serverSource, /Content-Security-Policy/);
  assert.match(serverSource, /default-src 'none'/);
});

test('country onboarding UI calls only protected draft and inactive mapping APIs', () => {
  assert.match(pageSource, /\/api\/admin\/countries/);
  assert.match(pageSource, /\/operators/);
  assert.match(pageSource, /\/providers/);
  assert.match(pageSource, /x-admin-api-key/);
  assert.match(pageSource, /Create draft country/);
  assert.match(pageSource, /Save inactive operator/);
  assert.match(pageSource, /Save disabled provider mapping/);
});

test('country onboarding UI provides read-only DT One operator and product discovery', () => {
  assert.match(pageSource, /\/api\/admin\/dtone\/operators/);
  assert.match(pageSource, /\/api\/admin\/dtone\/products/);
  assert.match(pageSource, /Discover DT One operators/);
  assert.match(pageSource, /Read-only DT One product discovery/);
  assert.match(pageSource, /No catalog records or activations changed/);
});

test('country onboarding UI does not persist admin credentials or offer activation controls', () => {
  assert.doesNotMatch(pageSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(pageSource, /activateCountry|enableProvider|activateProduct/);
  assert.match(pageSource, /activationPerformed/);
  assert.match(pageSource, /Never paste Stripe or DT One secret keys/);
});
