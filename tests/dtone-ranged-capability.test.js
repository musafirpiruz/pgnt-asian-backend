'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PGNT_MIN_AMOUNT,
  PGNT_MAX_AMOUNT,
  parseRangedProductCapability,
  isValidRangedDestinationAmount,
} = require('../dtone-ranged');

function rangedProduct(overrides = {}) {
  return {
    id: 98765,
    type: 'RANGED_VALUE_RECHARGE',
    destination: {
      unit: 'AFN',
      amount: { min: 50, max: 5000, increment: 5 },
    },
    accepted_calculation_modes: ['DESTINATION_AMOUNT'],
    ...overrides,
  };
}

test('parses a provider ranged capability and clamps selectable amounts to PGNT policy', () => {
  const capability = parseRangedProductCapability(rangedProduct());
  assert.ok(capability);
  assert.equal(capability.productId, '98765');
  assert.equal(capability.destinationCurrency, 'AFN');
  assert.equal(capability.selectableMinAmount, PGNT_MIN_AMOUNT + 0);
  assert.equal(capability.selectableMaxAmount, 3000);
  assert.equal(capability.active, false);
});

test('validates provider increment from its original minimum, not PGNT display minimum', () => {
  const capability = parseRangedProductCapability(rangedProduct());
  assert.equal(isValidRangedDestinationAmount(75, capability), true);
  assert.equal(isValidRangedDestinationAmount(76, capability), false);
  assert.equal(isValidRangedDestinationAmount(3000, capability), true);
  assert.equal(isValidRangedDestinationAmount(3005, capability), false);
});

test('rejects missing or unsupported ranged calculation capability', () => {
  assert.equal(parseRangedProductCapability(null), null);
  assert.equal(parseRangedProductCapability({ ...rangedProduct(), type: 'FIXED_VALUE_RECHARGE' }), null);
  assert.equal(parseRangedProductCapability({
    ...rangedProduct(), accepted_calculation_modes: ['SOURCE_AMOUNT'],
  }), null);
  assert.equal(parseRangedProductCapability({
    ...rangedProduct(), destination: { unit: 'AFN', amount: { min: 100, max: 50, increment: 5 } },
  }), null);
});

test('rejects fractional, zero, malformed and unsupported destination capabilities', () => {
  const invalid = [
    { destination: { unit: 'AFN', amount: { min: 75.5, max: 3000, increment: 5 } } },
    { destination: { unit: 'AFN', amount: { min: 75, max: 3000, increment: 0 } } },
    { destination: { unit: 'USD', amount: { min: 75, max: 3000, increment: 5 } } },
    { destination: { unit: 'AFN', amount: { min: 75, max: 3000, increment: 5 } }, accepted_calculation_modes: [] },
  ];
  for (const patch of invalid) {
    assert.equal(parseRangedProductCapability({ ...rangedProduct(), ...patch }), null);
  }
});

test('rejects values outside provider bounds, PGNT bounds, or increment steps', () => {
  const capability = parseRangedProductCapability(rangedProduct({
    destination: { unit: 'AFN', amount: { min: 100, max: 2000, increment: 25 } },
  }));
  assert.equal(isValidRangedDestinationAmount(75, capability), false);
  assert.equal(isValidRangedDestinationAmount(100, capability), true);
  assert.equal(isValidRangedDestinationAmount(125, capability), true);
  assert.equal(isValidRangedDestinationAmount(150, capability), true);
  assert.equal(isValidRangedDestinationAmount(160, capability), false);
  assert.equal(isValidRangedDestinationAmount(2001, capability), false);
  assert.equal(isValidRangedDestinationAmount(3001, capability), false);
});
