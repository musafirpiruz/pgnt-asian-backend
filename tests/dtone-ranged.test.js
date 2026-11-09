'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PGNT_MIN_AMOUNT, PGNT_MAX_AMOUNT, parseRangedProductCapability, isValidRangedDestinationAmount } = require('../dtone-ranged');

function product(overrides = {}) {
  return {
    id: 98765,
    type: 'RANGED_VALUE_RECHARGE',
    destination: { unit: 'AFN', amount: { min: 10, max: 3000, increment: 10 } },
    accepted_calculation_modes: ['DESTINATION_AMOUNT'],
    ...overrides,
  };
}

test('ranged amount module shares the global 75–3000 policy', () => {
  assert.equal(PGNT_MIN_AMOUNT, 75);
  assert.equal(PGNT_MAX_AMOUNT, 3000);
});

test('parses provider capability and rounds selectable minimum up to provider increment', () => {
  const capability = parseRangedProductCapability(product());
  assert.ok(capability);
  assert.equal(capability.productId, '98765');
  assert.equal(capability.destinationCurrency, 'AFN');
  assert.equal(capability.selectableMinAmount, 80);
  assert.equal(capability.selectableMaxAmount, 3000);
  assert.equal(capability.active, false);
});

test('intersects provider bounds with PGNT 75–3000 policy and increment', () => {
  const capability = parseRangedProductCapability(product({
    destination: { unit: 'PKR', amount: { min: 25, max: 5000, increment: 25 } },
  }));
  assert.equal(capability.selectableMinAmount, 75);
  assert.equal(capability.selectableMaxAmount, 3000);
  const stricterProviderMinimum = parseRangedProductCapability(product({
    destination: { unit: 'INR', amount: { min: 100, max: 5000, increment: 50 } },
  }));
  assert.equal(stricterProviderMinimum.selectableMinAmount, 100);
  assert.equal(parseRangedProductCapability(product({
    destination: { unit: 'BDT', amount: { min: 3005, max: 5000, increment: 5 } },
  })), null);
});

test('rejects invalid, unsupported, or incomplete provider ranged metadata', () => {
  assert.equal(parseRangedProductCapability(null), null);
  assert.equal(parseRangedProductCapability({ type: 'FIXED_VALUE_RECHARGE' }), null);
  assert.equal(parseRangedProductCapability(product({ accepted_calculation_modes: ['SOURCE_AMOUNT'] })), null);
  assert.equal(parseRangedProductCapability(product({ destination: { unit: 'AFN', amount: { min: 10, max: 3000 } } })), null);
  assert.equal(parseRangedProductCapability(product({ destination: { unit: 'AFN', amount: { min: 3000, max: 10, increment: 1 } } })), null);
  assert.equal(parseRangedProductCapability(product({ destination: { unit: 'UNKNOWN', amount: { min: 10, max: 3000, increment: 1 } } })), null);
});

test('accepts only integer amounts within PGNT and provider bounds on exact increments', () => {
  const capability = parseRangedProductCapability(product({
    destination: { unit: 'AFN', amount: { min: 50, max: 1000, increment: 50 } },
  }));
  for (const amount of [100, 150, 500, 1000]) assert.equal(isValidRangedDestinationAmount(amount, capability), true);
  for (const amount of [50, 75, 99, 1001, 3000, 50.5, 'abc']) assert.equal(isValidRangedDestinationAmount(amount, capability), false);
});

test('rejects fractional provider bounds and increments', () => {
  assert.equal(parseRangedProductCapability(product({
    destination: { unit: 'AFN', amount: { min: 10.5, max: 3000, increment: 0.5 } },
  })), null);
});

test('requires PGNT policy and a verified ranged capability before amount selection', () => {
  const capability = parseRangedProductCapability(product());
  assert.equal(isValidRangedDestinationAmount(80, capability), true);
  assert.equal(isValidRangedDestinationAmount(75, capability), false);
  assert.equal(isValidRangedDestinationAmount(10, capability), false);
  assert.equal(isValidRangedDestinationAmount(3000, capability), true);
  assert.equal(isValidRangedDestinationAmount(3001, capability), false);
  assert.equal(isValidRangedDestinationAmount(100, null), false);
});
