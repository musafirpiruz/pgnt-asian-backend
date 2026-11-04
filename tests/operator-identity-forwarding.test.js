'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('country operator discovery returns the stable registry key and provider operator ID', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf("app.get('/api/countries/:countryCode/products'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /o\.operator_key AS code/);
  assert.match(route, /o\.provider_operator_id AS "providerOperatorId"/);
  assert.match(route, /NULL::text AS "providerOperatorId"/, "legacy product_catalog fallback must return the same operator identity column");
});

test('active registry countries require an active operator with a verified provider-country mapping', () => {
  const start = server.indexOf('async function getVerifiedCountryOperator');
  const end = server.indexOf('async function getProduct', start);
  assert.ok(start >= 0 && end > start);
  const helper = server.slice(start, end);
  assert.match(helper, /countryStatus === 'active'/);
  assert.match(helper, /Both operatorKey and providerOperatorId are required/);
  assert.match(helper, /o\.active=TRUE/);
  assert.match(helper, /m\.verification_status='verified'/);
  assert.match(helper, /c\.status IN \('active','legacy'\)/);
});

test('registry-backed product selection is bound to the exact verified country operator and provider product ID', () => {
  const start = server.indexOf('async function getProduct');
  const end = server.indexOf('// Calculate the final customer price.', start);
  assert.ok(start >= 0 && end > start);
  const lookup = server.slice(start, end);
  assert.match(lookup, /FROM country_products cp/);
  assert.match(lookup, /cp\.operator_id=\$5::bigint/);
  assert.match(lookup, /cp\.provider_product_id=product_catalog\.product_id::text/);
  assert.match(lookup, /cp\.catalog_status='active'/);
  assert.match(lookup, /cp\.verification_status='verified'/);
  assert.match(lookup, /cp\.price_currency_verified=TRUE/);
  assert.match(lookup, /cp\.denomination=product_catalog\.amount/);
  assert.match(lookup, /cp\.destination_currency=product_catalog\.currency/);
  assert.match(lookup, /cp\.wholesale_eur_cents=product_catalog\.wholesale_price_eur_cents/);
  assert.match(lookup, /cp\.retail_eur_cents=product_catalog\.price_eur_cents/);
});

test('both price quote and checkout verify the operator identity before looking up a product', () => {
  const quoteStart = server.indexOf("app.get('/api/pricing/quote'");
  const checkoutStart = server.indexOf("app.post('/api/payments/checkout'");
  const quote = server.slice(quoteStart, checkoutStart);
  const checkout = server.slice(checkoutStart);
  assert.match(quote, /getVerifiedCountryOperator/);
  assert.match(quote, /operatorId: verifiedOperator\?\.id/);
  assert.match(checkout, /getVerifiedCountryOperator/);
  assert.match(checkout, /input\.operatorKey, input\.providerOperatorId/);
  assert.match(checkout, /operatorId: verifiedOperator\?\.id/);
  assert.match(checkout, /Product does not match selected country/);
  assert.match(checkout, /Product does not match selected operator/);
  assert.match(checkout, /Product does not match selected amount/);
});

test('checkout input rejects partial or malformed operator identity fields', () => {
  const start = server.indexOf('function validateCheckoutInput');
  const end = server.indexOf('// =====================================================', start);
  assert.ok(start >= 0 && end > start);
  const validation = server.slice(start, end);
  assert.match(validation, /Boolean\(operatorKey\) !== Boolean\(providerOperatorId\)/);
  assert.match(validation, /Invalid verified operator identifiers/);
  assert.match(validation, /operatorKey: operatorKey \|\| null/);
  assert.match(validation, /providerOperatorId: providerOperatorId \|\| null/);
});

test('Flutter retains provider identifiers and forwards them to both quote and checkout', () => {
  assert.match(flutter, /final String\? operatorKey/);
  assert.match(flutter, /final String\? providerOperatorId/);
  assert.match(flutter, /raw\['providerOperatorId'\]/);
  assert.match(flutter, /quoteParameters\['operatorKey'\]/);
  assert.match(flutter, /quoteParameters\['providerOperatorId'\]/);
  assert.match(flutter, /'operatorKey': selectedOperator!\.operatorKey!/);
  assert.match(flutter, /'providerOperatorId': selectedOperator!\.providerOperatorId!/);
  assert.match(flutter, /Map<String, List<int>> _loadedCountryAmountsByOperator/);
  assert.match(flutter, /raw\['operatorCode'\]/);
  assert.match(flutter, /_loadedCountryAmountsByOperator\[_operatorCatalogCode\(selectedOperator!\)\]/);
  assert.match(flutter, /_loadedCountryAmountsByOperator\[_operatorCatalogCode\(item\)\]/);
});
