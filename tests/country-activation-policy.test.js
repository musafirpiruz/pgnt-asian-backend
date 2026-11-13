'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCountryActivation, DEFAULT_REQUIRED_LANGUAGES } = require('../country-activation-policy');

function readyInput() {
  return {
    country: {
      countryCode: 'XX', status: 'testing', destinationCurrency: 'XXX',
      callingCode: '+999', phoneMinDigits: 8, phoneMaxDigits: 10,
      provider: 'dtone', providerCountryCode: 'XXX',
    },
    operators: [{ active: true, verified: true, providerOperatorId: 'operator-1' }],
    products: [{
      active: true, verified: true, providerProductId: 'product-1',
      currency: 'XXX', wholesaleCostMinor: 100, wholesaleCurrency: 'EUR',
    }],
    localizations: DEFAULT_REQUIRED_LANGUAGES.map(languageCode => ({ languageCode, displayName: 'Name' })),
    pricing: { active: true, paymentCurrency: 'EUR', feeCents: 49, minimumMarginCents: 1 },
    fx: { fresh: true, baseCurrency: 'EUR', destinationCurrency: 'XXX', rate: 1.2 },
    sandboxChecks: ['providerConnectivity', 'sampleQuote', 'successCallback', 'failureCallback']
      .map(name => ({ name, passed: true })),
  };
}

test('activation policy allows only a fully verified configuration', () => {
  const result = evaluateCountryActivation(readyInput());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.verifiedOperatorCount, 1);
  assert.equal(result.verifiedProductCount, 1);
});

test('activation policy fails closed for missing provider, product, FX and sandbox checks', () => {
  const input = readyInput();
  input.country.providerCountryCode = '';
  input.operators[0].verified = false;
  input.products[0].wholesaleCostMinor = 0;
  input.fx.fresh = false;
  input.sandboxChecks = [];
  const result = evaluateCountryActivation(input);
  assert.equal(result.eligible, false);
  for (const blocker of [
    'providerCountryMappingUnverified', 'noActiveVerifiedOperator',
    'noActiveVerifiedPricedProduct', 'missingStaleOrMismatchedFxRate',
  ]) assert.ok(result.blockers.includes(blocker));
  assert.ok(result.blockers.some(value => value.startsWith('sandboxChecksIncomplete:')));
});

test('activation policy requires all six localizations and valid EUR pricing', () => {
  const input = readyInput();
  input.localizations = input.localizations.filter(item => item.languageCode !== 'ps');
  input.pricing.paymentCurrency = 'USD';
  const result = evaluateCountryActivation(input);
  assert.ok(result.blockers.includes('missingLocalizations:ps'));
  assert.ok(result.blockers.includes('invalidOrInactiveEurPricing'));
});

test('active or disabled country cannot be activated through the testing gate', () => {
  const input = readyInput();
  input.country.status = 'active';
  assert.ok(evaluateCountryActivation(input).blockers.includes('countryMustBeInTestingOrConfiguring'));
  input.country.status = 'disabled';
  assert.ok(evaluateCountryActivation(input).blockers.includes('countryMustBeInTestingOrConfiguring'));
});

test('malformed inputs never throw and never become eligible', () => {
  const result = evaluateCountryActivation();
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.length > 0);
});
