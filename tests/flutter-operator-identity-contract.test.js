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
  assert.match(model, /final String\? operatorKey;/);
  assert.match(model, /final String\? providerOperatorId;/);
  assert.match(model, /this\.operatorKey,/);
  assert.match(model, /this\.providerOperatorId,/);
});

test('quote request forwards stable operator identifiers only when available', () => {
  const start = flutter.indexOf('Future<void> loadPriceQuote()');
  const end = flutter.indexOf('void selectCountry(', start);
  assert.ok(start >= 0 && end > start);
  const method = flutter.slice(start, end);
  assert.match(method, /'operatorKey': operator\.operatorKey!/);
  assert.match(method, /'providerOperatorId': operator\.providerOperatorId!/);
  assert.match(method, /operator\.operatorKey != null/);
  assert.match(method, /operator\.providerOperatorId != null/);
});

test('checkout request forwards the same stable operator identity as the quote', () => {
  const start = flutter.indexOf('Future<void> startPayment()');
  const end = flutter.indexOf('Future<void>', start + 20);
  assert.ok(start >= 0 && end > start);
  const method = flutter.slice(start, end);
  assert.match(method, /'operatorKey': selectedOperator!\.operatorKey!/);
  assert.match(method, /'providerOperatorId': selectedOperator!\.providerOperatorId!/);
  assert.match(method, /selectedOperator!\.operatorKey != null/);
  assert.match(method, /selectedOperator!\.providerOperatorId != null/);
});

test('registry parser preserves stable IDs independently of localized display labels', () => {
  const start = flutter.indexOf('factory MobileOperator.fromRegistryJson');
  const end = flutter.indexOf('\n  }', start);
  assert.ok(start >= 0 && end > start);
  const factory = flutter.slice(start, end);
  assert.match(factory, /json\['display_name'\]/);
  assert.match(factory, /json\['name'\]/);
  assert.match(factory, /json\['operator_key'\]/);
  assert.match(factory, /json\['code'\]/);
  assert.match(factory, /json\['provider_operator_id'\]/);
  assert.match(factory, /operatorKey:/);
  assert.match(factory, /providerOperatorId:/);
  assert.doesNotMatch(factory, /operatorKey:.*displayName/s);
});
