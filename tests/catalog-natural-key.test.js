'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCatalogCandidates } = require('../catalog-natural-key');

const candidate = (productId, overrides = {}) => ({
  productId: String(productId), operator: 'Afghan Wireless',
  amount: 100, currency: 'AFN', ...overrides,
});

test('keeps distinct DT One products with the same denomination as separate candidates', () => {
  const result = classifyCatalogCandidates(
    [
      candidate(1001, { productName: '100 AFN airtime' }),
      candidate(1002, { operator: 'AFGHAN WIRELESS', productName: '100 AFN data bundle' }),
    ], []
  );
  assert.deepEqual(result.toInsert.map(x => x.productId), ['1001', '1002']);
  assert.equal(result.conflicts.length, 0);
});

test('recognizes existing provider IDs without blocking a new same-denomination product', () => {
  const result = classifyCatalogCandidates(
    [candidate(1001), candidate(1002)],
    [{ product_id: 1001, operator: 'Afghan Wireless', amount: '100.00', currency: 'AFN' }]
  );
  assert.deepEqual(result.alreadyPresent, ['1001']);
  assert.deepEqual(result.toInsert.map(x => x.productId), ['1002']);
  assert.equal(result.conflicts.length, 0);
});

test('rejects duplicate provider product IDs within a single discovery batch', () => {
  const result = classifyCatalogCandidates([candidate(1001), candidate(1001)], []);
  assert.equal(result.toInsert.length, 0);
  assert.equal(result.conflicts.length, 2);
  assert.deepEqual(result.conflicts.map(x => x.conflictingProductIds), [['1001'], ['1001']]);
});

test('allows different denominations and currencies for separate provider IDs', () => {
  const result = classifyCatalogCandidates(
    [candidate(1001), candidate(1002, { amount: 200 }), candidate(1003, { currency: 'PKR' })], []
  );
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.toInsert.map(x => x.productId), ['1001', '1002', '1003']);
});
