'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const inventory = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'dtone-operator-coverage-candidates.json'),
  'utf8'
));

test('four-country candidate inventory includes all app network candidates', () => {
  assert.equal(inventory.paymentCurrency, 'EUR');
  assert.equal(inventory.applicationFeeEurCents, 49);
  assert.deepEqual(
    inventory.countries.map((country) => country.countryCode),
    ['AF', 'PK', 'IN', 'BD']
  );
  const names = inventory.countries.flatMap((country) =>
    country.candidates.map((name) => country.countryCode + ':' + name)
  );
  assert.equal(names.length, 16);
  assert.ok(names.includes('AF:Roshan'));
  assert.ok(names.includes('AF:Etisalat'));
  assert.ok(names.includes('AF:AWCC'));
  assert.ok(names.includes('AF:Salaam'));
  assert.ok(names.includes('PK:Zong'));
  assert.ok(names.includes('PK:Ufone'));
  assert.ok(names.includes('PK:Telenor'));
  assert.ok(names.includes('IN:Jio'));
  assert.ok(names.includes('IN:Vi'));
  assert.ok(names.includes('BD:Grameenphone'));
  assert.ok(names.includes('BD:Robi'));
  assert.ok(names.includes('BD:Banglalink'));
});

test('candidate names never masquerade as verified DT One provider identities', () => {
  assert.equal(inventory.rules.candidatesAreNotProviderVerified, true);
  assert.equal(inventory.rules.providerOperatorIdMustComeFromDtOne, true);
  assert.equal(inventory.rules.productIdsMustComeFromDtOne, true);
  assert.equal(inventory.rules.wholesalePricesMustBeVerifiedInEur, true);
  assert.equal(inventory.rules.noInventedProviderIdsOrProductIds, true);
  assert.equal(inventory.totals.candidateOperators, 16);
  assert.equal(inventory.totals.operatorsWithCsvEvidence, 4);
  assert.equal(inventory.totals.operatorsAwaitingProviderDiscovery, 12);
});

test('catalog candidate inventory cannot activate products or mappings', () => {
  assert.equal(inventory.rules.productsAndMappingsDefaultActive, false);
  assert.equal(inventory.rules.customerDiscoveryRequiresVerifiedActiveMappings, true);
  for (const evidence of inventory.evidence) {
    assert.equal(evidence.status, 'csv_products_unverified');
    assert.ok(evidence.csvProductCount > 0);
  }
});
