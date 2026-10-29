'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeE164, rateLimitLockKeys } = require('../phone-auth');

test('normalizes common international formatting to E.164', () => {
  assert.equal(normalizeE164('+1 (415) 555-2671'), '+14155552671');
  assert.equal(normalizeE164(' +33 6 12 34 56 78 '), '+33612345678');
  assert.equal(normalizeE164('+4915123456789'), '+4915123456789');
});

test('rejects numbers without international country code', () => {
  assert.equal(normalizeE164('0612345678'), null);
  assert.equal(normalizeE164('4155552671'), null);
  assert.equal(normalizeE164(''), null);
});

test('rejects invalid E.164 lengths and characters', () => {
  assert.equal(normalizeE164('+1234567'), null);
  assert.equal(normalizeE164('+1234567890123456'), null);
  assert.equal(normalizeE164('+01234567890'), null);
  assert.equal(normalizeE164('+1ABC5552671'), null);
});


test('rate-limit locks cover phone and IP independently in a stable order', () => {
  const first = rateLimitLockKeys('send', 'phone-hash', 'ip-hash');
  const reversed = rateLimitLockKeys('send', 'phone-hash', 'other-ip-hash');
  assert.equal(first.length, 2);
  assert.ok(first.some((key) => key === 'send:phone:phone-hash'));
  assert.ok(first.some((key) => key === 'send:ip:ip-hash'));
  assert.deepEqual(first, [...first].sort());
  assert.deepEqual(reversed, [...reversed].sort());
});
