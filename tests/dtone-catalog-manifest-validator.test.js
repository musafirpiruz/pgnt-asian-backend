'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest } = require('../scripts/validate-dtone-catalog');

function fixture() {
  return {
    schemaVersion: 1,
    paymentCurrency: 'EUR',
    applicationFeeEurCents: 49,
    safety: {
      importedToProduction: false,
      productsActive: false,
      operatorMappingsCreated: false,
      providerIdentityVerified: false,
      checkoutAllowedByManifest: false,
    },
    counts: { total: 1, fixed: 1, ranged: 0, uniqueProductIds: 1 },
    products: [{
      dtoneProductId: 123,
      countryCode: 'AF',
      destinationCurrency: 'AFN',
      operatorKey: null,
      providerOperatorId: null,
      active: false,
      verificationStatus: 'awaiting_live_dtone_identity_verification',
      wholesalePriceEurCents: 84,
      productKind: 'fixed',
      destinationAmount: '50',
      destinationAmountInteger: true,
      destinationAmountInt: 50,
    }],
  };
}

test('offline catalog validator accepts safe unverified fixed-product previews', () => {
  const result = validateManifest(fixture());
  assert.equal(result.valid, true);
  assert.deepEqual(result.summary, { total: 1, fixed: 1, ranged: 0, uniqueProductIds: 1 });
});

test('offline catalog validator rejects duplicate provider IDs and active products', () => {
  const manifest = fixture();
  manifest.products.push({ ...manifest.products[0] });
  manifest.counts = { total: 2, fixed: 2, ranged: 0, uniqueProductIds: 1 };
  manifest.products[1].active = true;
  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate DT One product ID')));
  assert.ok(result.errors.some((error) => error.includes('active product is forbidden')));
});

test('offline catalog validator rejects currency mismatch and wrong application fee', () => {
  const manifest = fixture();
  manifest.products[0].destinationCurrency = 'PKR';
  manifest.applicationFeeEurCents = 59;
  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('country/currency mismatch')));
  assert.ok(result.errors.some((error) => error.includes('€0.49')));
});

test('offline catalog validator keeps ranged products separate and checks bounds', () => {
  const manifest = fixture();
  manifest.products[0] = {
    ...manifest.products[0],
    productKind: 'ranged',
    destinationAmount: '30 - 4000',
    destinationMinAmount: 30,
    destinationMaxAmount: 4000,
    wholesalePriceEurMaxCents: 6633,
  };
  manifest.counts = { total: 1, fixed: 0, ranged: 1, uniqueProductIds: 1 };
  assert.equal(validateManifest(manifest).valid, true);
  manifest.products[0].destinationMaxAmount = 4001;
  assert.equal(validateManifest(manifest).valid, false);
});
