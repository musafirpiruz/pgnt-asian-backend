'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCountryRegistryRuntime } = require('../country-registry-runtime');

test('runtime starts empty and atomically publishes a validated snapshot', async () => {
  const expected = Object.freeze({ AF: Object.freeze({ currency: 'AFN' }) });
  let clock = 100;
  const runtime = createCountryRegistryRuntime({
    pool: { async query() {} },
    loader: async () => expected,
    now: () => clock,
  });
  assert.equal(runtime.getSnapshot(), null);
  const published = await runtime.refresh();
  assert.equal(published.countries, expected);
  assert.equal(published.refreshedAt, 100);
  clock = 200;
  assert.equal(runtime.getSnapshot().refreshedAt, 100);
});

test('failed refresh preserves the last known-good snapshot', async () => {
  let shouldFail = false;
  const good = Object.freeze({ AF: Object.freeze({ currency: 'AFN' }) });
  const runtime = createCountryRegistryRuntime({
    pool: { async query() {} },
    loader: async () => {
      if (shouldFail) throw new Error('database unavailable');
      return good;
    },
  });
  await runtime.refresh();
  const before = runtime.getSnapshot();
  shouldFail = true;
  await assert.rejects(runtime.refresh(), /database unavailable/);
  const after = runtime.getSnapshot();
  assert.equal(after.countries, before.countries);
  assert.equal(after.refreshedAt, before.refreshedAt);
});

test('concurrent refresh calls share one database load', async () => {
  let loads = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const expected = Object.freeze({ AF: Object.freeze({ currency: 'AFN' }) });
  const runtime = createCountryRegistryRuntime({
    pool: { async query() {} },
    loader: async () => {
      loads += 1;
      await gate;
      return expected;
    },
  });
  const first = runtime.refresh();
  const second = runtime.refresh();
  await Promise.resolve();
  assert.equal(loads, 1);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.countries, expected);
  assert.equal(b.countries, expected);
});

test('runtime rejects missing pool and invalid loader output without publishing', async () => {
  assert.throws(() => createCountryRegistryRuntime(), /PostgreSQL pool is required/);
  const runtime = createCountryRegistryRuntime({
    pool: { async query() {} },
    loader: async () => null,
  });
  await assert.rejects(runtime.refresh(), /invalid snapshot/);
  assert.equal(runtime.getSnapshot(), null);
});
