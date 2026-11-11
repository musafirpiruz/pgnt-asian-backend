'use strict';

const PGNT_MIN_AMOUNT = 75;
const PGNT_MAX_AMOUNT = 3000;

function positiveFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseRangedProductCapability(product) {
  if (!product || typeof product !== 'object') return null;
  const productType = String(product.type || '').trim().toUpperCase();
  if (productType !== 'RANGED_VALUE_RECHARGE') return null;

  const amount = product.destination && product.destination.amount;
  if (!amount || typeof amount !== 'object' || Array.isArray(amount)) return null;

  const minAmount = positiveFiniteNumber(amount.min);
  const maxAmount = positiveFiniteNumber(amount.max);
  const increment = positiveFiniteNumber(amount.increment);
  const destinationCurrency = String(product.destination.unit || '').trim().toUpperCase();
  const acceptedCalculationModes = Array.isArray(product.accepted_calculation_modes)
    ? [...new Set(product.accepted_calculation_modes.map((mode) => String(mode).trim().toUpperCase()).filter(Boolean))]
    : [];

  if (!Number.isSafeInteger(minAmount) || !Number.isSafeInteger(maxAmount) ||
      !Number.isSafeInteger(increment) || maxAmount < minAmount ||
      !/^[A-Z]{3}$/.test(destinationCurrency) ||
      !acceptedCalculationModes.includes('DESTINATION_AMOUNT')) {
    return null;
  }

  const selectableMinAmount = minAmount + Math.ceil((Math.max(minAmount, PGNT_MIN_AMOUNT) - minAmount) / increment) * increment;
  const selectableMaxAmount = minAmount + Math.floor((Math.min(maxAmount, PGNT_MAX_AMOUNT) - minAmount) / increment) * increment;
  if (selectableMinAmount > selectableMaxAmount) return null;

  return Object.freeze({
    productId: product.id == null ? null : String(product.id),
    productType,
    amountMode: 'DESTINATION_AMOUNT',
    destinationCurrency,
    minAmount,
    maxAmount,
    increment,
    acceptedCalculationModes,
    pgntMinAmount: PGNT_MIN_AMOUNT,
    pgntMaxAmount: PGNT_MAX_AMOUNT,
    selectableMinAmount,
    selectableMaxAmount,
    active: false,
  });
}

function isValidRangedDestinationAmount(value, capability) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) ||
      amount < PGNT_MIN_AMOUNT ||
      amount > PGNT_MAX_AMOUNT ||
      !capability ||
      capability.productType !== 'RANGED_VALUE_RECHARGE' ||
      capability.amountMode !== 'DESTINATION_AMOUNT' ||
      !Number.isFinite(capability.minAmount) ||
      !Number.isFinite(capability.maxAmount) ||
      !Number.isFinite(capability.increment) ||
      capability.increment <= 0 ||
      amount < capability.minAmount ||
      amount > capability.maxAmount) {
    return false;
  }

  const steps = (amount - capability.minAmount) / capability.increment;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

module.exports = {
  PGNT_MIN_AMOUNT,
  PGNT_MAX_AMOUNT,
  parseRangedProductCapability,
  isValidRangedDestinationAmount,
};
