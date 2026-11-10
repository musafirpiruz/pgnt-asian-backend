'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveApprovedFxObservation } = require('../fx-observation');

const now = Date.parse('2026-11-10T12:00:00.000Z');
function row(overrides = {}) {
  return {
    base_currency: 'EUR', quote_currency: 'PKR', quote_per_base: '310.76300000',
    source: 'approved-reference-feed', source_reference: 'daily-close',
    observed_at: '2026-11-10T00:00:00.000Z', expires_at: '2026-11-15T00:00:00.000Z',
    is_approved: true, ...overrides,
  };
}

test('selects newest approved unexpired EUR rate for requested currency', () => {
  const result = resolveApprovedFxObservation([
    row({ quote_per_base: '300', observed_at: '2026-11-09T00:00:00.000Z' }),
    row(), row({ quote_currency: 'AFN', quote_per_base: '75' }),
    row({ is_approved: false, quote_per_base: '999' }),
  ], 'PKR', { now });
  assert.equal(result.quoteCurrency, 'PKR');
  assert.equal(result.quotePerBase, 310.763);
  assert.equal(result.source, 'approved-reference-feed');
});

test('fails closed for missing, unapproved, expired, future, stale, or invalid rates', () => {
  const cases = [
    [], [row({ is_approved: false })],
    [row({ expires_at: '2026-11-10T11:59:59.000Z' })],
    [row({ observed_at: '2026-11-10T12:01:00.000Z' })],
    [row({ observed_at: '2026-11-01T00:00:00.000Z' })],
    [row({ quote_per_base: '0' })],
  ];
  for (const rows of cases) assert.throws(() => resolveApprovedFxObservation(rows, 'PKR', { now }), /No approved, current/);
});

test('does not use another currency as an implicit fallback', () => {
  assert.throws(() => resolveApprovedFxObservation([row({ quote_currency: 'AFN' })], 'PKR', { now }), /EUR\\/PKR/);
});

test('rejects conflicting newest approved rates instead of choosing arbitrarily', () => {
  assert.throws(() => resolveApprovedFxObservation([
    row({ quote_per_base: '310' }), row({ quote_per_base: '311', source: 'second-feed' }),
  ], 'PKR', { now }), /Conflicting approved/);
});

test('rejects invalid currency and malformed input', () => {
  assert.throws(() => resolveApprovedFxObservation([], 'PK'), /valid destination currency/);
  assert.throws(() => resolveApprovedFxObservation({}, 'PKR'), /array/);
});
