'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCatalogRows } = require('../catalog-staging-validator');
function row(overrides = {}) {
  return { productId:1001,country:'AF',operator:'ATOMA',service:'Mobile',
    destinationAmount:'100',destinationCurrency:'AFN',productType:'FIXED_VALUE_RECHARGE',
    wholesalePriceEur:'1.25',retailPriceEur:'1.49',...overrides };
}
test('validates four local-currency markets and keeps rows inactive/unverified', () => {
  const result=validateCatalogRows([
    row(),row({productId:2001,country:'PK',operator:'Jazz',destinationCurrency:'PKR'}),
    row({productId:3001,country:'IN',operator:'Airtel',destinationCurrency:'INR'}),
    row({productId:4001,country:'BD',operator:'Robi',destinationCurrency:'BDT'}),
  ]);
  assert.equal(result.totalRows,4);
  assert.deepEqual(Object.keys(result.counts.byCountry).sort(),['AF','BD','IN','PK']);
  assert.ok(result.rows.every(x=>x.active===false && x.providerVerified===false));
});
test('accepts ranged local-currency products without inventing fixed amounts',()=>{
  const result=validateCatalogRows([row({productType:'RANGED_VALUE_RECHARGE',destinationAmount:'30 - 4000',wholesalePriceEur:'0.50 - 66.33',retailPriceEur:'0.56 - 73.70'})]);
  assert.equal(result.counts.rangedRows,1);
  assert.equal(result.rows[0].destinationAmount,'30 - 4000');
  assert.equal(result.rows[0].active,false);
});
test('accepts USD only for fixed eSIM PIN products',()=>{
  const result=validateCatalogRows([row({country:'IN',operator:'eSIM India',service:'eSIM',productType:'FIXED_VALUE_PIN_PURCHASE',destinationAmount:'2.29',destinationCurrency:'USD',wholesalePriceEur:'2.58',retailPriceEur:'2.87'})]);
  assert.equal(result.counts.esimUsdRows,1);
  assert.equal(result.rows[0].catalogClass,'ESIM_USD_PIN');
});
test('rejects USD currency for non-eSIM products and wrong local currency',()=>{
  assert.throws(()=>validateCatalogRows([row({destinationCurrency:'USD'})]),/destination currency mismatch/);
  assert.throws(()=>validateCatalogRows([row({country:'PK',destinationCurrency:'AFN'})]),/destination currency mismatch/);
});
test('rejects missing prices, malformed ranges and retail below wholesale',()=>{
  assert.throws(()=>validateCatalogRows([row({wholesalePriceEur:''})]),/wholesalePriceEur is required/);
  assert.throws(()=>validateCatalogRows([row({destinationAmount:'30 - x'})]),/destinationAmount must be positive or a valid min-max range/);
  assert.throws(()=>validateCatalogRows([row({wholesalePriceEur:'2',retailPriceEur:'1.99'})]),/retail EUR price range cannot be below/);
});
test('rejects duplicate provider IDs and duplicate destination keys',()=>{
  assert.throws(()=>validateCatalogRows([row(),row({operator:'Different operator'})]),/duplicate productId/);
  assert.throws(()=>validateCatalogRows([row(),row({productId:1002})]),/duplicate country\/operator\/amount\/currency\/type key/);
});
