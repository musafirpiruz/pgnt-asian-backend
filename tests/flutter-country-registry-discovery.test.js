'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Flutter country selector consumes the active country registry API', () => {
  assert.match(dart, /_loadRegistryCountries\(\)/);
  assert.match(dart, /\/api\/countries/);
  assert.match(dart, /queryParameters: \{'language': requestedLanguage\}/);
  assert.match(dart, /_availableCountries\s*=\s*parsed/);
  assert.match(dart, /children: _availableCountries/);
});

test('registry country parser validates provider-neutral country metadata', () => {
  assert.match(dart, /factory AppCountry\.fromRegistryJson/);
  assert.match(dart, /countryCode/);
  assert.match(dart, /callingCode/);
  assert.match(dart, /phoneMinDigits/);
  assert.match(dart, /phoneMaxDigits/);
  assert.match(dart, /Invalid country registry record/);
});

test('customer country discovery API exposes active countries only', () => {
  const route = backend.slice(
    backend.indexOf("app.get('/api/countries'"),
    backend.indexOf("app.get('/api/countries/:countryCode/operators'"),
  );
  assert.ok(route.length > 0);
  assert.match(route, /WHERE c\.status = 'active'/);
  assert.match(route, /countryCode:/);
  assert.match(route, /callingCode:/);
  assert.match(route, /phoneMinDigits:/);
  assert.match(route, /phoneMaxDigits:/);
});

test('country discovery refreshes when the app language changes', () => {
  assert.match(dart, /languageCode = value;[\s\S]{0,180}_loadRegistryCountries\(\)/);
});
