'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateProviderPayload,
  refreshCountryFxRates,
} = require('../fx-rates');

const now = Date.UTC(2026, 10, 3, 12, 0, 0);
function payload(overrides = {}) {
  return {
    result: 'success',
    base_code: 'EUR',
    time_last_update_unix: Math.floor((now - 60 * 60 * 1000) / 1000),
    time_next_update_unix: Math.floor((now + 23 * 60 * 60 * 1000) / 1000),
    conversion_rates: { AFN: 75, PKR: 300, INR: 105, BDT: 130 },
    ...overrides,
  };
}
function fakePool(updatedRows = ['AF', 'PK', 'IN', 'BD']) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql: String(sql).trim(), params });
      if (String(sql).includes('UPDATE pricing_settings')) {
        const country = params[0];
        const found = updatedRows.includes(country);
        return { rows: found ? [{ country }] : [], rowCount: found ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ sql: 'RELEASE' }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test('FX payload validates all four supported currencies and provider freshness', () => {
  const result = validateProviderPayload(payload(), now);
  assert.deepEqual(result.rates, { AF: 75, PK: 300, IN: 105, BD: 130 });
  assert.equal(result.providerUpdatedAt.getTime(), now - 60 * 60 * 1000);
});

test('FX payload rejects missing currency, invalid rate, and stale timestamp', () => {
  assert.throws(() => validateProviderPayload(payload({ conversion_rates: { AFN: 75, PKR: 300, INR: 105 } }), now), /valid BDT rate/);
  assert.throws(() => validateProviderPayload(payload({ conversion_rates: { AFN: 0, PKR: 300, INR: 105, BDT: 130 } }), now), /valid AFN rate/);
  assert.throws(() => validateProviderPayload(payload({ time_last_update_unix: 1 }), now), /older than 48 hours/);
});

test('FX refresh updates all four rows and writes an audit history entry per country atomically', async () => {
  const { pool, calls } = fakePool();
  const result = await refreshCountryFxRates(pool, {
    now: () => now,
    apiKey: 'test-api-key',
    fetchImpl: async (url) => { assert.match(url, /test-api-key\/latest\/EUR$/); return { ok: true, json: async () => payload() }; },
  });
  assert.deepEqual(result.updatedCountries, ['AF', 'PK', 'IN', 'BD']);
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO fx_rate_history')).length, 4);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-2).sql, 'COMMIT');
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

test('FX refresh rolls back if all four configured pricing rows are not present', async () => {
  const { pool, calls } = fakePool(['AF', 'PK', 'IN']);
  await assert.rejects(
    refreshCountryFxRates(pool, {
      now: () => now,
      fetchImpl: async () => ({ ok: true, json: async () => payload() }),
    }),
    /exactly four configured country pricing rows/
  );
  assert.ok(calls.some(call => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some(call => call.sql === 'COMMIT'));
});

test('FX refresh leaves the database untouched when the provider is unavailable', async () => {
  const { pool, calls } = fakePool();
  await assert.rejects(
    refreshCountryFxRates(pool, {
      now: () => now,
      apiKey: 'test-api-key',
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /HTTP 503/
  );
  assert.equal(calls.length, 0);
});
