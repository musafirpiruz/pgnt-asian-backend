'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildDtOneFxObservation } = require('../dtone-fx');

test('DT One FX observations are independently scoped to all four destination currencies', () => {
  const currencies = { AF: 'AFN', PK: 'PKR', IN: 'INR', BD: 'BDT' };
  for (const [country, currency] of Object.entries(currencies)) {
    const observation = buildDtOneFxObservation({
      id: 1000 + Object.keys(currencies).indexOf(country),
      source: { unit: 'EUR' },
      destination: { unit: currency },
      rates: { wholesale: 12.34 },
    }, currency);
    assert.equal(observation.baseCurrency, 'EUR');
    assert.equal(observation.quoteCurrency, currency);
    assert.equal(observation.quotePerBase, 12.34);
    assert.equal(observation.source, 'DT_ONE');
  }
});

test('FX admin routes require explicit confirmation and preserve pending approval', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const captureStart = server.indexOf("app.post('/api/admin/countries/:countryCode/fx/observations'");
  const approveStart = server.indexOf("app.post('/api/admin/countries/:countryCode/fx/observations/:observationId/approve'");
  const previewStart = server.indexOf("// Read-only, network-scoped DT One product approval preview.");
  assert.notEqual(captureStart, -1);
  assert.ok(approveStart > captureStart);
  assert.ok(previewStart > approveStart);
  const capture = server.slice(captureStart, approveStart);
  const approval = server.slice(approveStart, previewStart);

  assert.match(capture, /confirmFxObservation !== true/);
  assert.match(capture, /buildDtOneFxObservation\(product, expectedCurrency\)/);
  assert.match(capture, /INSERT INTO country_fx_rates/);
  assert.match(capture, /'DT_ONE'/);
  assert.match(capture, /VALUES[\s\S]*FALSE/);
  assert.match(capture, /pendingApproval: true/);
  assert.match(capture, /productsActivated: false/);
  assert.match(capture, /pricesWritten: false/);
  assert.match(capture, /resolveDtOneCountryMapping\(providerIso\)/);

  assert.match(approval, /confirmFxApproval !== true/);
  assert.match(approval, /FOR UPDATE/);
  assert.match(approval, /row\.quote_currency !== expectedCurrency/);
  assert.match(approval, /row\.source !== 'DT_ONE'/);
  assert.match(approval, /expiresAt <= now/);
  assert.match(approval, /SET is_approved=TRUE,approved_at=NOW\(\)/);
  assert.match(approval, /productsActivated: false/);
  assert.match(approval, /pricesWritten: false/);
  assert.doesNotMatch(approval, /UPDATE product_catalog|UPDATE pricing_settings|UPDATE country_operator_products/);
});

test('FX history route is country-scoped and limited', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = server.indexOf("app.get('/api/admin/countries/:countryCode/fx/observations'");
  const end = server.indexOf("app.post('/api/admin/countries/:countryCode/fx/observations'", start);
  assert.notEqual(start, -1);
  const route = server.slice(start, end);
  assert.match(route, /WHERE country_code=\$1/);
  assert.match(route, /LIMIT 50/);
  assert.match(route, /requireAdmin/);
});

test('FX admin panel script parses and offers capture, history, and explicit approval', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-panel.html'), 'utf8');
  const scripts = [...admin.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  const script = scripts[scripts.length - 1][1];
  assert.doesNotThrow(() => new vm.Script(script));
  for (const id of ['fxCountry', 'fxProductId', 'captureFxObservation', 'loadFxObservations', 'fxObservations']) {
    assert.ok(admin.includes('id="' + id + '"'), 'missing admin control ' + id);
  }
  assert.match(script, /confirmFxObservation:\s*true/);
  assert.match(script, /confirmFxApproval:\s*true/);
  assert.match(script, /DT One نرخ ثبت شو او د اډمین تایید ته انتظار باسي/);
});
