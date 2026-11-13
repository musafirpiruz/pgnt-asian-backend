'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('successful empty verified operator response must not fall back to bundled unverified operators', () => {
  const getterStart = flutter.indexOf('List<MobileOperator> get countryOperators');
  const getterEnd = flutter.indexOf('Future<void> _loadRegistryOperators', getterStart);
  assert.ok(getterStart >= 0 && getterEnd > getterStart);
  const getter = flutter.slice(getterStart, getterEnd);
  assert.match(getter, /_registryOperatorsCountry == selectedCountry\.code/);
  assert.doesNotMatch(getter, /_registryOperators\.isNotEmpty/);
  assert.match(getter, /return _registryOperators;/);

  const loaderStart = flutter.indexOf('Future<void> _loadRegistryOperators');
  const loaderEnd = flutter.indexOf('List<int> get amounts', loaderStart);
  const loader = flutter.slice(loaderStart, loaderEnd);
  assert.match(loader, /requestedLanguage != languageCode\)\s*\{\s*return;/);
  assert.match(loader, /_registryOperators = parsed;/);
  assert.match(loader, /_registryOperatorsCountry = countryCode;/);
  assert.doesNotMatch(loader, /parsed\.isEmpty\)\s*\{\s*return;/);
});
