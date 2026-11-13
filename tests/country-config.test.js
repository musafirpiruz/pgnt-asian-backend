'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORTED_COUNTRIES,
  COUNTRY_CURRENCIES,
  getCountryConfig,
} = require('../country-config');

test('country and currency definitions come from one canonical configuration', () => {
  assert.deepEqual(COUNTRY_CURRENCIES, {
    AF: 'AFN',
    PK: 'PKR',
    IN: 'INR',
    BD: 'BDT',
  });
  for (const [code, config] of Object.entries(SUPPORTED_COUNTRIES)) {
    assert.equal(COUNTRY_CURRENCIES[code], config.currency);
    assert.match(code, /^[A-Z]{2}$/);
    assert.match(config.currency, /^[A-Z]{3}$/);
    assert.match(config.callingCode, /^\+[1-9]\d{0,3}$/);
    assert.ok(Array.isArray(config.phoneDigits));
    assert.ok(config.phoneDigits[0] > 0);
    assert.ok(config.phoneDigits[1] >= config.phoneDigits[0]);
  }
});

test('country lookup normalizes ISO codes and safely rejects unknown countries', () => {
  assert.equal(getCountryConfig(' af ').currency, 'AFN');
  assert.equal(getCountryConfig('PK').callingCode, '+92');
  assert.equal(getCountryConfig('ZZ'), null);
  assert.equal(getCountryConfig(null), null);
});

test('country configuration and nested phone rules are immutable', () => {
  assert.equal(Object.isFrozen(SUPPORTED_COUNTRIES), true);
  for (const config of Object.values(SUPPORTED_COUNTRIES)) {
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.isFrozen(config.phoneDigits), true);
  }
});
