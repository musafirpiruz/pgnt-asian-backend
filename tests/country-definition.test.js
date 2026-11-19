'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCountryDefinition,
  validateCountryRegistry,
} = require('../country-definition');

function ghana(overrides = {}) {
  return {
    countryCode: 'GH',
    countryName: 'Ghana',
    destinationCurrency: 'GHS',
    callingCode: '+233',
    phoneMinDigits: 9,
    phoneMaxDigits: 9,
    provider: 'dtone',
    providerCountryCode: 'GHA',
    languages: ['en'],
    ...overrides,
  };
}

test('accepts a future country through data configuration without code changes', () => {
  const result = validateCountryDefinition(ghana());
  assert.equal(result.valid, true);
  assert.deepEqual(result.normalized, {
    countryCode: 'GH', countryName: 'Ghana', destinationCurrency: 'GHS',
    callingCode: '+233', phoneMinDigits: 9, phoneMaxDigits: 9,
    provider: 'dtone', providerCountryCode: 'GHA', languages: ['en'],
  });
});

test('rejects invalid country, currency, calling code and phone rules', () => {
  const result = validateCountryDefinition(ghana({
    countryCode: 'GHA', destinationCurrency: 'EURO', callingCode: '233',
    phoneMinDigits: 0, phoneMaxDigits: 16,
  }));
  assert.equal(result.valid, false);
  for (const reason of [
    'invalid_iso_country_code', 'invalid_iso_currency_code',
    'invalid_international_calling_code', 'invalid_phone_min_digits',
    'invalid_phone_max_digits',
  ]) assert.ok(result.errors.includes(reason));
});

test('requires explicit language and provider metadata; does not guess it', () => {
  assert.ok(validateCountryDefinition(ghana({ languages: [] })).errors.includes('invalid_language_list'));
  assert.ok(validateCountryDefinition(ghana({ providerCountryCode: '??' })).errors.includes('invalid_provider_country_code'));
});

test('rejects duplicate country codes before a registry can be imported', () => {
  const result = validateCountryRegistry([ghana(), ghana({ countryName: 'Ghana duplicate' })]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.errors.includes('duplicate_country_code')));
  assert.deepEqual(result.countries, []);
});

test('rejects an empty registry', () => {
  assert.deepEqual(validateCountryRegistry([]), {
    valid: false, errors: ['country_registry_must_be_non_empty'], countries: [],
  });
});

test('never treats validation as activation', () => {
  const result = validateCountryDefinition(ghana());
  assert.equal(result.valid, true);
  assert.equal(Object.hasOwn(result.normalized, 'active'), false);
});
