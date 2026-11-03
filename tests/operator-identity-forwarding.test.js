'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Flutter forwards registry operator identifiers to quote and checkout requests', () => {
  assert.match(flutter, /'operatorKey': operator\.operatorKey!/);
  assert.match(flutter, /'providerOperatorId': operator\.providerOperatorId!/);
  assert.match(flutter, /'operatorKey': selectedOperator!\.operatorKey!/);
  assert.match(flutter, /'providerOperatorId': selectedOperator!\.providerOperatorId!/);
});

test('checkout validates complete operator identity and rejects partial mappings', () => {
  const start = server.indexOf('function validateCheckoutInput');
  const end = server.indexOf('// Get a quote using server-side product and pricing data.', start);
  const validation = server.slice(start, end);
  assert.match(validation, /Boolean\(operatorKey\) !== Boolean\(providerOperatorId\)/);
  assert.match(validation, /Invalid verified operator mapping/);
});

test('quotes and checkout require an active country operator with the exact provider ID', () => {
  assert.match(server, /async function getVerifiedCountryOperator/);
  assert.match(server, /WHERE country_code = \$1 AND operator_key = \$2 AND active = TRUE/);
  assert.match(server, /provider_operator_id\) !== providerOperatorId/);
  const quote = server.slice(server.indexOf("app.get('/api/pricing/quote'"), server.indexOf("app.post('/api/payments/checkout'"));
  const checkout = server.slice(server.indexOf("app.post('/api/payments/checkout'"), server.indexOf("app.post('/api/admin/stripe-dtone/sandbox-checkout'"));
  assert.ok(quote.indexOf('getVerifiedCountryOperator') >= 0);
  assert.ok(checkout.indexOf('getVerifiedCountryOperator') >= 0);
});

test('legacy curated operators without registry IDs retain the legacy path', () => {
  assert.match(server, /if \(!operatorKey && !providerOperatorId\) return null/);
});
