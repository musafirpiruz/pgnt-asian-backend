'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectEligibleNetworkProducts } = require('../network-product-approval');

const rows = [
  {mapping_id:1,country_code:'AF',operator_key:'afghan-wireless',product_catalog_id:10,provider_product_id:501,currency:'AFN',product_country:'AF',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:180,amount:100},
  {mapping_id:2,country_code:'AF',operator_key:'afghan-wireless',product_catalog_id:11,provider_product_id:502,currency:'AFN',product_country:'AF',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:220,amount:200},
  {mapping_id:3,country_code:'AF',operator_key:'roshan',product_catalog_id:12,provider_product_id:503,currency:'AFN',product_country:'AF',operator:'Roshan',operator_name:'Roshan',wholesale_price_eur_cents:200,amount:150},
  {mapping_id:4,country_code:'PK',operator_key:'afghan-wireless',product_catalog_id:13,provider_product_id:504,currency:'PKR',product_country:'PK',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:200,amount:150},
  {mapping_id:5,country_code:'AF',operator_key:'afghan-wireless',product_catalog_id:14,provider_product_id:505,currency:'AFN',product_country:'AF',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:null,amount:100},
];

test('selects all and only eligible products for exact country and stable network', () => {
  const result = selectEligibleNetworkProducts(rows, {countryCode:'AF',operatorKey:'afghan-wireless',sourceCatalogId:10});
  assert.deepEqual(result.eligible.map(x=>x.productCatalogId), [10,11]);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.customerProductsActivated, false);
  assert.equal(result.catalogPricesWritten, false);
});

test('refuses a source product outside the exact network', () => {
  assert.throws(() => selectEligibleNetworkProducts(rows, {countryCode:'AF',operatorKey:'afghan-wireless',sourceCatalogId:12}), /source product/);
});

test('refuses unsupported country or invalid stable operator key', () => {
  assert.throws(() => selectEligibleNetworkProducts(rows, {countryCode:'XX',operatorKey:'x',sourceCatalogId:10}));
  assert.throws(() => selectEligibleNetworkProducts(rows, {countryCode:'AF',operatorKey:'',sourceCatalogId:10}));
});


test('network approval helper rejects denominations outside the supported 75–3000 range', () => {
  const outOfRange = rows.map(row => ({...row}));
  outOfRange[0].amount = 50;
  assert.throws(() => selectEligibleNetworkProducts(outOfRange, {
    countryCode:'AF',operatorKey:'afghan-wireless',sourceCatalogId:10,
  }), /source product/);
});

test('admin routes expose read-only preview and auditable approval without activating products', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const previewStart = server.indexOf("app.get('/api/admin/countries/:countryCode/operators/:operatorKey/product-approval-preview'");
  const batchStart = server.indexOf("app.post('/api/admin/countries/:countryCode/operators/:operatorKey/product-approval-batches'");
  assert.notEqual(previewStart, -1);
  assert.ok(batchStart > previewStart);
  const preview = server.slice(previewStart, batchStart);
  const batchEnd = server.indexOf('// Read-only country onboarding overview', batchStart);
  const batch = server.slice(batchStart, batchEnd);
  assert.match(preview, /provider_price_source === 'dtone_api'/);
  assert.match(preview, /24 \* 60 \* 60 \* 1000/);
  assert.match(batch, /confirmApprovalBatch !== true/);
  assert.match(batch, /country_network_product_approval_batches/);
  assert.match(batch, /country_network_product_approval_items/);
  assert.match(batch, /customerProductsActivated:\s*false/);
  assert.match(batch, /catalogPricesWritten:\s*false/);
  assert.doesNotMatch(batch, /UPDATE product_catalog|UPDATE country_operator_products/);
});
