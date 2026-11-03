'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateProviderPayload,
  refreshCountryFxRates,
  FX_RATE_SOURCE,
} = require('../fx-rates');

const now = Date.UTC(2026, 10, 3, 12, 0, 0);
function payload(overrides = {}) {
  return [
    { date: '2026-11-03', base: 'EUR', quote: 'AFN', rate: 75 },
    { date: '2026-11-03', base: 'EUR', quote: 'PKR', rate: 300 },
    { date: '2026-11-03', base: 'EUR', quote: 'INR', rate: 105 },
    { date: '2026-11-03', base: 'EUR', quote: 'BDT', rate: 130 },
    ...overrides.extraRows || [],
  ].filter((row) => !overrides.removeQuotes?.includes(row.quote))
   .map((row) => overrides.replace?.[row.quote] || row);
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

test('Frankfurter payload validates all four EUR reference rates and their dates', () => {
  const result = validateProviderPayload(payload(), now);
  assert.deepEqual(result.rates, { AF: 75, PK: 300, IN: 105, BD: 130 });
  assert.equal(result.providerUpdatedAtByCountry.AF.toISOString(), '2026-11-03T00:00:00.000Z');
});

test('Frankfurter payload rejects missing currency, invalid rate, future date, and stale date', () => {
  assert.throws(() => validateProviderPayload(payload({ removeQuotes: ['BDT'] }), now), /dated EUR\/BDT rate/);
  assert.throws(() => validateProviderPayload(payload({ replace: { AFN: { date: '2026-11-03', base: 'EUR', quote: 'AFN', rate: 0 } } }), now), /valid AFN rate/);
  assert.throws(() => validateProviderPayload(payload({ replace: { PKR: { date: '2026-11-05', base: 'EUR', quote: 'PKR', rate: 300 } } }), now), /future/);
  assert.throws(() => validateProviderPayload(payload({ replace: { INR: { date: '2026-10-20', base: 'EUR', quote: 'INR', rate: 105 } } }), now), /older than five days/);
});

test('FX refresh updates all four rows and writes an audit history entry per country atomically', async () => {
  const { pool, calls } = fakePool();
  const result = await refreshCountryFxRates(pool, {
    now: () => now,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.frankfurter.dev');
      assert.equal(parsed.pathname, '/v2/rates');
      assert.equal(parsed.searchParams.get('base'), 'EUR');
      assert.equal(parsed.searchParams.get('quotes'), 'AFN,PKR,INR,BDT');
      return { ok: true, json: async () => payload() };
    },
  });
  assert.deepEqual(result.updatedCountries, ['AF', 'PK', 'IN', 'BD']);
  assert.equal(result.source, FX_RATE_SOURCE);
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
    /one configured pricing row for country BD/
  );
  assert.ok(calls.some(call => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some(call => call.sql === 'COMMIT'));
});

test('FX refresh leaves the database untouched when the provider is unavailable', async () => {
  const { pool, calls } = fakePool();
  await assert.rejects(
    refreshCountryFxRates(pool, {
      now: () => now,
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /HTTP 503/
  );
  assert.equal(calls.length, 0);
});
