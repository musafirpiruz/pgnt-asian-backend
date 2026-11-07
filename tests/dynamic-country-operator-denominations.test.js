'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('dynamic denominations are grouped by the provider operator identity', () => {
  assert.match(flutter, /Map<String, List<int>> _loadedAmountsByOperator/);
  assert.match(flutter, /final operatorName = \(raw\['operator'\] \?\? ''\)\.toString\(\)\.trim\(\)/);
  assert.match(flutter, /nextAmountsByOperator\.putIfAbsent\(operatorName, \(\) => <int>\{\}\)\.add\(value\)/);
  assert.match(flutter, /entry\.key: \(entry\.value\.toList\(\)\.\.sort\(\)\)/);
});

test('amount selector exposes only denominations for the selected operator', () => {
  const start = flutter.indexOf('List<int> get amounts');
  const end = flutter.indexOf('String _flagForCountry', start);
  assert.ok(start >= 0 && end > start);
  const getter = flutter.slice(start, end);
  assert.match(getter, /if \(_countryCatalogLoaded\)/);
  assert.match(getter, /if \(operator == null\) return const \[\]/);
  assert.match(getter, /_loadedAmountsByOperator\[key\] \?\? const \[\]/);
  assert.doesNotMatch(getter, /_loadedCountryAmounts/);
});

test('changing operator resets an unavailable denomination to that operator first valid amount', () => {
  const start = flutter.indexOf('Widget buildOperatorSelector()');
  const end = flutter.indexOf('Widget buildAmountSelector()', start);
  assert.ok(start >= 0 && end > start);
  const selector = flutter.slice(start, end);
  assert.match(selector, /_loadedAmountsByOperator\[item\.providerName \?\? item\.name\]/);
  assert.match(selector, /selectedAmount = operatorAmounts\.first/);
  assert.match(selector, /selectedOperator = item/);
});

test('country changes and catalog failures clear per-operator denomination state', () => {
  assert.match(flutter, /_loadedAmountsByOperator = \{\}/);
  assert.doesNotMatch(flutter, /_loadedCountryAmounts/);
});
