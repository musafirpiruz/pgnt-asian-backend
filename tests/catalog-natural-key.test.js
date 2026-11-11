'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCatalogCandidates } = require('../catalog-natural-key');

const candidate = (productId, overrides = {}) => ({
  productId: String(productId), operator: 'Afghan Wireless',
  amount: 100, currency: 'AFN', ...overrides,
});

test('classifies two provider products with same denomination as conflicts, never picks one', () => {
  const result = classifyCatalogCandidates(
    [candidate(1001), candidate(1002, { operator: 'AFGHAN WIRELESS' })], []
  );
  assert.equal(result.toInsert.length, 0);
  assert.equal(result.conflicts.length, 2);
  assert.deepEqual(result.conflicts.map(x => x.conflictingProductIds), [['1002'], ['1001']]);
});

test('preserves existing denomination and reports every conflicting provider ID', () => {
  const result = classifyCatalogCandidates(
    [candidate(1002), candidate(1003)],
    [{ product_id: 1001, operator: 'Afghan Wireless', amount: '100.00', currency: 'AFN' }]
  );
  assert.equal(result.toInsert.length, 0);
  assert.equal(result.conflicts.length, 2);
  assert.deepEqual(result.conflicts.map(x => x.conflictingProductIds), [['1001'], ['1001']]);
});

test('allows distinct denominations and recognizes an already registered provider ID', () => {
  const result = classifyCatalogCandidates(
    [candidate(1001), candidate(1002, { amount: 200 })],
    [{ product_id: 1001, operator: 'Afghan Wireless', amount: '100.00', currency: 'AFN' }]
  );
  assert.deepEqual(result.alreadyPresent, ['1001']);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.toInsert.map(x => x.productId), ['1002']);
});
