'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDtOneCatalogMatch } = require('../catalog-auto-verification');

function catalog(overrides = {}) {
  return {
    id: 12, product_id: '7194', country: 'AF', operator: 'ATOMA',
    amount: 115, currency: 'AFN', active: false, ...overrides,
  };
}
function provider(overrides = {}) {
  return {
    id: 7194,
    type: 'FIXED_VALUE_RECHARGE',
    operator: { id: 88, name: 'ATOMA Afghanistan', country: { iso_code: 'AFG' } },
    destination: { amount: 115, unit: 'AFN' },
    prices: { retail: { amount: 2.10 }, wholesale: { amount: 1.89 } },
    ...overrides,
  };
}

test('accepts exact authoritative product match and returns EUR cents without activation', () => {
  const result = evaluateDtOneCatalogMatch(catalog(), provider());
  assert.equal(result.verified, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.provider.wholesalePriceEurCents, 189);
  assert.equal(result.provider.retailPriceEurCents, 210);
  assert.equal(result.activationChanged, false);
  assert.equal(result.databaseModified, false);
  assert.equal(result.transactionCreated, false);
});

test('rejects product ID mismatch even when display identity matches', () => {
  const result = evaluateDtOneCatalogMatch(catalog(), provider({ id: 9999 }));
  assert.equal(result.verified, false);
  assert.ok(result.reasons.includes('provider_product_id_mismatch'));
});

test('rejects wrong country, operator, currency and denomination', () => {
  const cases = [
    [catalog({ country: 'PK', currency: 'PKR' }), provider()],
    [catalog({ operator: 'Roshan' }), provider()],
    [catalog({ currency: 'PKR' }), provider()],
    [catalog({ amount: 100 }), provider()],
  ];
  for (const [local, remote] of cases) {
    assert.equal(evaluateDtOneCatalogMatch(local, remote).verified, false);
  }
});

test('rejects unsupported product type and missing or invalid wholesale pricing', () => {
  assert.ok(evaluateDtOneCatalogMatch(catalog(), provider({ type: 'UNKNOWN' }))
    .reasons.includes('unsupported_product_type'));
  assert.ok(evaluateDtOneCatalogMatch(catalog(), provider({
    prices: { retail: { amount: 2.1 }, wholesale: { amount: null } },
  })).reasons.includes('invalid_or_missing_eur_prices'));
  assert.ok(evaluateDtOneCatalogMatch(catalog(), provider({
    prices: { retail: { amount: 1.5 }, wholesale: { amount: 1.9 } },
  })).reasons.includes('invalid_or_missing_eur_prices'));
});

test('requires an authoritative provider operator ID, not just a display name', () => {
  const missingId = provider({ operator: { name: 'ATOMA Afghanistan', country: { iso_code: 'AFG' } } });
  const result = evaluateDtOneCatalogMatch(catalog(), missingId);
  assert.equal(result.verified, false);
  assert.ok(result.reasons.includes('missing_or_invalid_provider_operator_id'));
});

test('never auto-verifies an already active catalog row', () => {
  const result = evaluateDtOneCatalogMatch(catalog({ active: true }), provider());
  assert.equal(result.verified, false);
  assert.ok(result.reasons.includes('active_catalog_row_not_eligible_for_auto_verification'));
});

test('fails closed for incomplete provider payloads', () => {
  assert.equal(evaluateDtOneCatalogMatch(catalog(), null).verified, false);
  assert.equal(evaluateDtOneCatalogMatch(catalog(), {}).verified, false);
});
