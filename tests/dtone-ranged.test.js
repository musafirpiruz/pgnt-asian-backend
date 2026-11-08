'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRangedProductCapability,
  isValidRangedDestinationAmount,
} = require('../dtone-ranged');

function product(overrides = {}) {
  return {
    id: 98765,
    type: 'RANGED_VALUE_RECHARGE',
    destination: {
      unit: 'AFN',
      amount: { min: 10, max: 3000, increment: 10 },
    },
    accepted_calculation_modes: ['DESTINATION_AMOUNT'],
    ...overrides,
  };
}

test('parses a valid DT One ranged recharge capability without activating it', () => {
  const capability = parseRangedProductCapability(product());
  assert.ok(capability);
  assert.equal(capability.productId, '98765');
  assert.equal(capability.destinationCurrency, 'AFN');
  assert.equal(capability.selectableMinAmount, 10);
  assert.equal(capability.selectableMaxAmount, 3000);
  assert.equal(capability.active, false);
});

test('intersects provider bounds with PGNT 10–3000 policy and increment', () => {
  const capability = parseRangedProductCapability(product({
    destination: { unit: 'PKR', amount: { min: 25, max: 5000, increment: 25 } },
  }));
  assert.equal(capability.selectableMinAmount, 25);
  assert.equal(capability.selectableMaxAmount, 3000);

  const tooHighMinimum = parseRangedProductCapability(product({
    destination: { unit: 'INR', amount: { min: 3005, max: 5000, increment: 5 } },
  }));
  assert.equal(tooHighMinimum.selectableMinAmount, 3010);
  assert.equal(tooHighMinimum.selectableMaxAmount, 3000);
});

test('rejects invalid, unsupported, or incomplete provider ranged metadata', () => {
  assert.equal(parseRangedProductCapability(null), null);
  assert.equal(parseRangedProductCapability({ type: 'FIXED_VALUE_RECHARGE' }), null);
  assert.equal(parseRangedProductCapability(product({
    accepted_calculation_modes: ['SOURCE_AMOUNT'],
  })), null);
  assert.equal(parseRangedProductCapability(product({
    destination: { unit: 'AFN', amount: { min: 10, max: 3000 } },
  })), null);
  assert.equal(parseRangedProductCapability(product({
    destination: { unit: 'AFN', amount: { min: 3000, max: 10, increment: 1 } },
  })), null);
  assert.equal(parseRangedProductCapability(product({
    destination: { unit: 'UNKNOWN', amount: { min: 10, max: 3000, increment: 1 } },
  })), null);
});

test('accepts only integer customer amounts inside provider bounds and on exact increments', () => {
  const capability = parseRangedProductCapability(product({
    destination: { unit: 'AFN', amount: { min: 50, max: 1000, increment: 50 } },
  }));
  for (const amount of [50, 100, 500, 1000]) {
    assert.equal(isValidRangedDestinationAmount(amount, capability), true);
  }
  for (const amount of [10, 49, 75, 1001, 3000, 50.5, 'abc']) {
    assert.equal(isValidRangedDestinationAmount(amount, capability), false);
  }
});

test('requires PGNT policy and a verified ranged capability before amount selection', () => {
  const capability = parseRangedProductCapability(product());
  assert.equal(isValidRangedDestinationAmount(10, capability), true);
  assert.equal(isValidRangedDestinationAmount(3000, capability), true);
  assert.equal(isValidRangedDestinationAmount(9, capability), false);
  assert.equal(isValidRangedDestinationAmount(3001, capability), false);
  assert.equal(isValidRangedDestinationAmount(100, null), false);
});
