'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('Flutter operator model keeps stable registry identity separate from display name', () => {
  const start = flutter.indexOf('class MobileOperator {');
  const end = flutter.indexOf('// Brand-inspired', start);
  assert.ok(start >= 0 && end > start);
  const model = flutter.slice(start, end);
  assert.ok(model.includes('final String? operatorKey;'));
  assert.ok(model.includes('final String? providerOperatorId;'));
  assert.ok(model.includes('this.operatorKey,'));
  assert.ok(model.includes('this.providerOperatorId,'));
});

test('quote request forwards operatorKey but never trusts or forwards providerOperatorId', () => {
  const start = flutter.indexOf('Future<void> loadPriceQuote()');
  const end = flutter.indexOf('void selectCountry(', start);
  assert.ok(start >= 0 && end > start);
  const method = flutter.slice(start, end);
  assert.ok(method.includes("'productId': productId"));
  assert.ok(method.includes("'productId': productId"));
  assert.ok(!method.includes('providerOperatorId'));
});

test('checkout request forwards operatorKey but never trusts or forwards providerOperatorId', () => {
  const start = flutter.indexOf('Future<void> startPayment()');
  const end = flutter.indexOf('Future<void>', start + 20);
  assert.ok(start >= 0 && end > start);
  const method = flutter.slice(start, end);
  assert.ok(method.includes("'productId': priceQuote!['productId'].toString()"));
  assert.ok(method.includes("_selectedProduct == null"));
  assert.ok(!method.includes('providerOperatorId'));
});

test('registry parser preserves stable IDs independently of localized display labels', () => {
  const start = flutter.indexOf('factory MobileOperator.fromRegistryJson');
  const end = flutter.indexOf('// Brand-inspired', start);
  assert.ok(start >= 0 && end > start);
  const factory = flutter.slice(start, end);
  for (const field of ["json['display_name']", "json['name']", "json['operator_key']", "json['code']", "json['provider_operator_id']", 'operatorKey:', 'providerOperatorId:']) {
    assert.ok(factory.includes(field), 'missing parser field: ' + field);
  }
  assert.ok(!factory.includes('operatorKey: displayName'));
});

test('registry loader ignores stale responses after country or language changes', () => {
  const start = flutter.indexOf('Future<void> _loadRegistryOperators(String countryCode)');
  const end = flutter.indexOf('List<int> get amounts', start);
  assert.ok(start >= 0 && end > start);
  const loader = flutter.slice(start, end);
  assert.match(loader, /_registryOperatorsRequestGeneration/);
  assert.match(loader, /final requestGeneration = \+\+_registryOperatorsRequestGeneration/);
  assert.match(loader, /final requestedLanguage = languageCode/);
  assert.match(loader, /queryParameters: \{\s*'language': requestedLanguage\s*\}/);
  assert.match(loader, /requestGeneration != _registryOperatorsRequestGeneration/);
  assert.match(loader, /requestedLanguage != languageCode/);
});
