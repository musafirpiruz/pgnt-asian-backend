'use strict';

// Offline-only DT One catalog manifest validator.
// This tool never connects to PostgreSQL, calls DT One, imports rows, or activates products.
const fs = require('node:fs');

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.products)) {
    return { valid: false, errors: ['Unsupported or malformed catalog manifest.'] };
  }
  if (manifest.paymentCurrency !== 'EUR' || manifest.applicationFeeEurCents !== 49) {
    errors.push('Manifest must preserve EUR checkout and the €0.49 application fee.');
  }
  if (manifest.safety?.importedToProduction !== false ||
      manifest.safety?.productsActive !== false ||
      manifest.safety?.operatorMappingsCreated !== false ||
      manifest.safety?.providerIdentityVerified !== false ||
      manifest.safety?.checkoutAllowedByManifest !== false) {
    errors.push('Manifest safety flags must remain disabled.');
  }
  const ids = new Set();
  const countries = { AF: 'AFN', PK: 'PKR', IN: 'INR', BD: 'BDT' };
  let fixed = 0;
  let ranged = 0;
  for (const [index, product] of manifest.products.entries()) {
    const label = 'products[' + index + ']';
    if (!Number.isSafeInteger(product.dtoneProductId) || product.dtoneProductId <= 0) {
      errors.push(label + ': invalid DT One product ID.');
    } else if (ids.has(product.dtoneProductId)) {
      errors.push(label + ': duplicate DT One product ID.');
    } else ids.add(product.dtoneProductId);
    if (countries[product.countryCode] !== product.destinationCurrency) {
      errors.push(label + ': country/currency mismatch.');
    }
    if (product.active !== false || product.operatorKey !== null ||
        product.providerOperatorId !== null ||
        product.verificationStatus !== 'awaiting_live_dtone_identity_verification') {
      errors.push(label + ': unverified provider identity or active product is forbidden.');
    }
    if (!Number.isSafeInteger(product.wholesalePriceEurCents) ||
        product.wholesalePriceEurCents <= 0) {
      errors.push(label + ': invalid wholesale price in EUR cents.');
    }
    if (product.productKind === 'fixed') {
      fixed++;
      if (typeof product.destinationAmount !== 'string' ||
          !/^\\d+(?:\\.\\d+)?$/.test(product.destinationAmount)) {
        errors.push(label + ': fixed destination amount must be a numeric string.');
      }
      if (product.destinationAmountInteger === true &&
          (!Number.isSafeInteger(product.destinationAmountInt) ||
           product.destinationAmountInt <= 0)) {
        errors.push(label + ': invalid integer destination amount.');
      }
      if (product.destinationAmountInteger === false &&
          product.destinationAmountInt !== null) {
        errors.push(label + ': decimal fixed amount must not be coerced to integer.');
      }
    } else if (product.productKind === 'ranged') {
      ranged++;
      if (!Number.isSafeInteger(product.destinationMinAmount) ||
          !Number.isSafeInteger(product.destinationMaxAmount) ||
          product.destinationMinAmount <= 0 ||
          product.destinationMaxAmount < product.destinationMinAmount ||
          product.destinationAmount !== product.destinationMinAmount + ' - ' + product.destinationMaxAmount) {
        errors.push(label + ': ranged amount bounds are invalid.');
      }
      if (!Number.isSafeInteger(product.wholesalePriceEurMaxCents) ||
          product.wholesalePriceEurMaxCents < product.wholesalePriceEurCents) {
        errors.push(label + ': ranged wholesale price bounds are invalid.');
      }
    } else {
      errors.push(label + ': unsupported product kind.');
    }
  }
  if (manifest.counts?.total !== manifest.products.length ||
      manifest.counts?.uniqueProductIds !== ids.size ||
      manifest.counts?.fixed !== fixed ||
      manifest.counts?.ranged !== ranged) {
    errors.push('Manifest summary counts do not match product rows.');
  }
  return { valid: errors.length === 0, errors, summary: {
    total: manifest.products.length, fixed, ranged, uniqueProductIds: ids.size,
  } };
}

if (require.main === module) {
  const filename = process.argv[2];
  if (!filename) {
    process.stderr.write('Usage: node scripts/validate-dtone-catalog.js <manifest.json>\\n');
    process.exitCode = 2;
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
      const result = validateManifest(manifest);
      process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
      if (!result.valid) process.exitCode = 1;
    } catch (error) {
      process.stderr.write('Catalog manifest validation failed: ' + error.message + '\\n');
      process.exitCode = 1;
    }
  }
}

module.exports = { validateManifest };
