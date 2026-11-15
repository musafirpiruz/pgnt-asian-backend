'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectEligibleNetworkProducts } = require('../network-product-approval');

const rows = [
  {mapping_id:1,country_code:'AF',operator_key:'afghan-wireless',product_catalog_id:10,provider_product_id:501,currency:'AFN',product_country:'AF',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:180},
  {mapping_id:2,country_code:'AF',operator_key:'afghan-wireless',product_catalog_id:11,provider_product_id:502,currency:'AFN',product_country:'AF',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:220},
  {mapping_id:3,country_code:'AF',operator_key:'roshan',product_catalog_id:12,provider_product_id:503,currency:'AFN',product_country:'AF',operator:'Roshan',operator_name:'Roshan',wholesale_price_eur_cents:200},
  {mapping_id:4,country_code:'PK',operator_key:'afghan-wireless',product_catalog_id:13,provider_product_id:504,currency:'PKR',product_country:'PK',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:200},
  {mapping_id:5,country_code:'AF',operator_key:'afghan-wireless',product_catalog_id:14,provider_product_id:505,currency:'AFN',product_country:'AF',operator:'AWCC',operator_name:'AWCC',wholesale_price_eur_cents:null},
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
