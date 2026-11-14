'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActiveCountryConfig, loadActiveCountryConfig } = require('../country-registry');

const activeAfghanistan = {
  country_code: 'AF',
  country_name: 'Afghanistan',
  destination_currency: 'AFN',
  calling_code: '+93',
  provider: 'dtone',
  provider_country_code: 'AFG',
  phone_min_digits: 9,
  phone_max_digits: 9,
  status: 'active',
  configuration_version: 2,
};

test('only active countries are exposed to customer configuration', () => {
  const config = buildActiveCountryConfig([
    activeAfghanistan,
    { ...activeAfghanistan, country_code: 'PK', status: 'testing' },
  ]);
  assert.deepEqual(Object.keys(config), ['AF']);
  assert.equal(config.AF.currency, 'AFN');
  assert.equal(config.AF.provider, 'dtone');
  assert.equal(config.AF.providerCountryCode, 'AFG');
});

test('validates country identity, currency, calling code and phone rules', () => {
  for (const patch of [
    { country_code: 'A1' },
    { destination_currency: 'EURO' },
    { calling_code: '93' },
    { provider_country_code: null },
    { phone_min_digits: 0 },
    { phone_min_digits: 10, phone_max_digits: 9 },
    { configuration_version: 0 },
  ]) {
    assert.throws(() => buildActiveCountryConfig([{ ...activeAfghanistan, ...patch }]));
  }
});

test('rejects duplicate active country codes and freezes returned configuration', () => {
  assert.throws(() => buildActiveCountryConfig([
    activeAfghanistan,
    { ...activeAfghanistan, country_name: 'Afghanistan duplicate' },
  ]), /Duplicate active country/);
  const config = buildActiveCountryConfig([activeAfghanistan]);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.AF), true);
  assert.equal(Object.isFrozen(config.AF.phoneDigits), true);
});


test('database loader requests only active registry rows and validates the result', async () => {
  let sql = '';
  const pool = {
    async query(statement) {
      sql = statement;
      return { rows: [activeAfghanistan] };
    },
  };
  const config = await loadActiveCountryConfig(pool);
  assert.match(sql, /FROM country_registry/i);
  assert.match(sql, /WHERE status = 'active'/i);
  assert.equal(config.AF.callingCode, '+93');
});

test('database loader fails closed when database access or registry data is invalid', async () => {
  await assert.rejects(() => loadActiveCountryConfig(null), /PostgreSQL pool is required/);
  await assert.rejects(() => loadActiveCountryConfig({
    async query() { throw new Error('database unavailable'); },
  }), /database unavailable/);
  await assert.rejects(() => loadActiveCountryConfig({
    async query() { return { rows: [{ ...activeAfghanistan, destination_currency: 'BAD!' }] }; },
  }), /Invalid destination currency/);
});
