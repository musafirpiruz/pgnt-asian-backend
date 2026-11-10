'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDtOneFxObservation } = require('../dtone-fx');

function product(overrides = {}) {
  return {
    id: 7194,
    source: { unit_type: 'CURRENCY', unit: 'EUR' },
    destination: { unit_type: 'CURRENCY', unit: 'AFN' },
    rates: { wholesale: 72.5, retail: 71.9, base: 70.8 },
    operator: { id: 123 },
    ...overrides,
  };
}

test('uses DT One wholesale rate, not retail or base rate', () => {
  const result = buildDtOneFxObservation(product(), 'AFN', {
    observedAt: '2026-11-10T00:00:00.000Z',
    ttlMs: 60_000,
  });
  assert.equal(result.quotePerBase, 72.5);
  assert.equal(result.source, 'DT_ONE');
  assert.equal(result.sourceReference, 'product:7194:operator:123');
  assert.equal(result.expiresAt, '2026-11-10T00:01:00.000Z');
});

test('rejects non-EUR DT One source currency', () => {
  assert.throws(
    () => buildDtOneFxObservation(product({ source: { unit: 'USD' } }), 'AFN'),
    /source currency is not EUR/
  );
});

test('rejects destination currency mismatch', () => {
  assert.throws(
    () => buildDtOneFxObservation(product(), 'PKR'),
    /does not match expected PKR/
  );
});

test('rejects missing, zero, negative and non-finite wholesale rates', () => {
  for (const rate of [null, 0, -1, 'not-a-rate']) {
    assert.throws(
      () => buildDtOneFxObservation(product({ rates: { wholesale: rate } }), 'AFN'),
      /valid wholesale FX rate/
    );
  }
});

test('rejects missing product identity and invalid expiry configuration', () => {
  assert.throws(() => buildDtOneFxObservation(product({ id: 0 }), 'AFN'), /valid DT One product/);
  assert.throws(() => buildDtOneFxObservation(product(), 'AFN', { ttlMs: 0 }), /TTL must be valid/);
});

