'use strict';

// Central country configuration for the current supported markets.
// Keep payment settlement currency (EUR) separate from destination currencies.
// A future market must be added only after country registry, provider,
// operator, phone-validation, FX and product verification are complete.
const SUPPORTED_COUNTRIES = Object.freeze({
  AF: Object.freeze({
    name: 'Afghanistan',
    currency: 'AFN',
    phoneDigits: Object.freeze([9, 9]),
    callingCode: '+93',
  }),
  PK: Object.freeze({
    name: 'Pakistan',
    currency: 'PKR',
    phoneDigits: Object.freeze([10, 10]),
    callingCode: '+92',
  }),
  IN: Object.freeze({
    name: 'India',
    currency: 'INR',
    phoneDigits: Object.freeze([10, 10]),
    callingCode: '+91',
  }),
  BD: Object.freeze({
    name: 'Bangladesh',
    currency: 'BDT',
    phoneDigits: Object.freeze([10, 10]),
    callingCode: '+880',
  }),
});

const COUNTRY_CURRENCIES = Object.freeze(
  Object.fromEntries(
    Object.entries(SUPPORTED_COUNTRIES).map(([code, config]) => [code, config.currency])
  )
);

function getCountryConfig(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return SUPPORTED_COUNTRIES[code] || null;
}

module.exports = {
  SUPPORTED_COUNTRIES,
  COUNTRY_CURRENCIES,
  getCountryConfig,
};
