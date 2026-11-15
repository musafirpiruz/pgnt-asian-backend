'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateMasterPricingPolicy,
  calculateCountryProductPrice,
  buildCountryPricingPreview,
} = require('../master-country-pricing');

const policy = {
  version: 1, feeEurCents: 49,
  stripeFeePercent: 1.5, stripeFixedFeeCents: 25,
};

test('master policy is country-neutral, EUR-based and disables legacy bonus', () => {
  const result = validateMasterPricingPolicy(policy);
  assert.equal(result.paymentCurrency, 'EUR');
  assert.equal(result.feeEurCents, 49);
  assert.equal(result.bonusPercent, 0);
  assert.equal('fxRate' in result, false);
});

test('rejects invalid fee, Stripe percentage and fixed fee', () => {
  assert.throws(() => validateMasterPricingPolicy({...policy, feeEurCents: -1}), /app fee/);
  assert.throws(() => validateMasterPricingPolicy({...policy, stripeFeePercent: 100}), /Stripe fee/);
  assert.throws(() => validateMasterPricingPolicy({...policy, stripeFixedFeeCents: 1.5}), /fixed fee/);
});

test('calculates using each product own DT One wholesale EUR cents', () => {
  const af = calculateCountryProductPrice(189, policy);
  const pk = calculateCountryProductPrice(250, policy);
  assert.equal(af.customerPriceEurCents, 268);
  assert.ok(pk.customerPriceEurCents > af.customerPriceEurCents);
  assert.equal(af.wholesaleEurCents, 189);
});

test('preview blocks missing FX and missing wholesale rather than reusing legacy country rates', () => {
  const result = buildCountryPricingPreview({
    policy,
    countries: [{country_code:'AF',destination_currency:'AFN'}],
    products: [{product_id:11,country:'AF',currency:'AFN',operator:'A',amount:100,wholesale_price_eur_cents:189}],
    fxRates: [],
  });
  assert.equal(result.countries[0].ready, false);
  assert.equal(result.countries[0].fxRate, null);
  assert.match(result.countries[0].blockers[0], /approved/);
  assert.equal(result.pricesWritten, false);
});

test('each country uses only its own approved fresh FX and product wholesale', () => {
  const now = Date.parse('2026-11-15T00:00:00Z');
  const countries = [
    {country_code:'AF',destination_currency:'AFN'},
    {country_code:'PK',destination_currency:'PKR'},
  ];
  const products = [
    {product_id:1,country:'AF',currency:'AFN',operator:'A',amount:100,wholesale_price_eur_cents:189},
    {product_id:2,country:'PK',currency:'PKR',operator:'B',amount:100,wholesale_price_eur_cents:250},
  ];
  const fxRates = [
    {country_code:'AF',base_currency:'EUR',quote_currency:'AFN',rate:'70.1',is_approved:true,approved_at:'2026-11-14T00:00:00Z',observed_at:'2026-11-14T00:00:00Z',expires_at:'2026-11-16T00:00:00Z'},
    {country_code:'PK',base_currency:'EUR',quote_currency:'PKR',rate:'300.2',is_approved:true,approved_at:'2026-11-14T00:00:00Z',observed_at:'2026-11-14T00:00:00Z',expires_at:'2026-11-16T00:00:00Z'},
  ];
  const result = buildCountryPricingPreview({policy,countries,products,fxRates,now});
  assert.equal(result.countries.length,2);
  assert.equal(result.countries[0].fxRate,'70.1');
  assert.equal(result.countries[1].fxRate,'300.2');
  assert.equal(result.countries[0].products[0].wholesaleEurCents,189);
  assert.equal(result.countries[1].products[0].wholesaleEurCents,250);
  assert.equal(result.countries.every(c=>c.ready),true);
  assert.equal(result.activationPerformed,false);
  assert.equal(result.pricesWritten,false);
});

test('rejects expired, unapproved and cross-country FX evidence', () => {
  const now = Date.parse('2026-11-15T00:00:00Z');
  const fxRates = [{country_code:'PK',base_currency:'EUR',quote_currency:'PKR',rate:'300',is_approved:true,approved_at:'2026-11-14T00:00:00Z',observed_at:'2026-11-14T00:00:00Z',expires_at:'2026-11-14T00:00:00Z'}];
  const result = buildCountryPricingPreview({
    policy,countries:[{country_code:'AF',destination_currency:'AFN'}],
    products:[{product_id:1,country:'AF',currency:'AFN',operator:'A',amount:100,wholesale_price_eur_cents:189}],
    fxRates,now,
  });
  assert.equal(result.countries[0].ready,false);
  assert.equal(result.countries[0].fxRate,null);
});
