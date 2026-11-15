'use strict';

const SUPPORTED_COUNTRIES = Object.freeze({
  AF: 'AFN', PK: 'PKR', IN: 'INR', BD: 'BDT',
});
const MAX_PROVIDER_PRICE_AGE_MS = 24 * 60 * 60 * 1000;

function integer(value, field, min, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`Invalid ${field}.`);
  }
  return number;
}

function percent(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number >= 100) {
    throw new Error(`Invalid ${field}.`);
  }
  return number;
}

/**
 * A master policy is country-neutral. It contains only fee/Stripe rules.
 * It never contains an exchange rate or a wholesale product price.
 */
function validateMasterPricingPolicy(input = {}) {
  const feeEurCents = integer(input.feeEurCents, 'app fee in EUR cents', 0, 100000);
  const stripeFeePercent = percent(input.stripeFeePercent, 'Stripe fee percentage');
  const stripeFixedFeeCents = integer(input.stripeFixedFeeCents, 'Stripe fixed fee in EUR cents', 0, 10000);
  const version = input.version == null ? 1 : integer(input.version, 'policy version', 1);
  return Object.freeze({
    version,
    paymentCurrency: 'EUR',
    feeEurCents,
    stripeFeePercent,
    stripeFixedFeeCents,
    bonusPercent: 0,
  });
}

/** Price a single product using that country's own provider wholesale quote. */
function calculateCountryProductPrice(wholesaleEurCents, policy) {
  const wholesale = integer(wholesaleEurCents, 'verified DT One wholesale price in EUR cents', 1);
  const approved = validateMasterPricingPolicy(policy);
  const targetNet = wholesale + approved.feeEurCents;
  if (!Number.isSafeInteger(targetNet)) throw new Error('Target price exceeds the supported range.');
  const rate = approved.stripeFeePercent / 100;
  let customerPrice = Math.ceil((targetNet + approved.stripeFixedFeeCents) / (1 - rate));
  let stripeFee = Math.ceil(customerPrice * rate) + approved.stripeFixedFeeCents;
  while (customerPrice - stripeFee < targetNet) {
    customerPrice += 1;
    stripeFee = Math.ceil(customerPrice * rate) + approved.stripeFixedFeeCents;
    if (!Number.isSafeInteger(customerPrice)) throw new Error('Customer price exceeds the supported range.');
  }
  return Object.freeze({
    paymentCurrency: 'EUR',
    wholesaleEurCents: wholesale,
    appFeeEurCents: approved.feeEurCents,
    estimatedStripeFeeEurCents: stripeFee,
    customerPriceEurCents: customerPrice,
    policyVersion: approved.version,
  });
}

/**
 * Build an all-country staging preview. Each country uses its own wholesale
 * evidence and independently approved FX evidence. Missing/stale evidence
 * blocks that country; legacy pricing_settings FX is intentionally ignored.
 */
function buildCountryPricingPreview({ policy, countries, products, fxRates, now = Date.now() }) {
  const approvedPolicy = validateMasterPricingPolicy(policy);
  if (!Array.isArray(countries) || !Array.isArray(products) || !Array.isArray(fxRates)) {
    throw new TypeError('Countries, products and FX rates must be arrays.');
  }
  const result = [];
  for (const country of countries) {
    const code = String(country.country_code || '').trim().toUpperCase();
    const currency = SUPPORTED_COUNTRIES[code];
    if (!currency || String(country.destination_currency || '').trim().toUpperCase() !== currency) continue;
    const fx = fxRates.find(row =>
      String(row.country_code || '').trim().toUpperCase() === code &&
      String(row.base_currency || '').toUpperCase() === 'EUR' &&
      String(row.quote_currency || '').toUpperCase() === currency &&
      row.is_approved === true && row.approved_at &&
      Number.isFinite(Date.parse(row.expires_at)) &&
      Date.parse(row.expires_at) > now &&
      Date.parse(row.observed_at) <= now
    );
    const countryProducts = products.filter(p =>
      String(p.country || '').trim().toUpperCase() === code &&
      String(p.currency || '').trim().toUpperCase() === currency
    );
    const rows = [];
    const blockers = [];
    if (!fx) blockers.push('Missing independently approved, unexpired EUR-to-destination FX evidence.');
    if (!countryProducts.length) blockers.push('No country products with matching destination currency.');
    for (const product of countryProducts) {
      const id = Number(product.product_id);
      const wholesale = Number(product.wholesale_price_eur_cents);
      const verifiedAt = Date.parse(product.provider_price_verified_at);
      const providerProductId = Number(product.provider_price_product_id);
      const evidenceValid = product.provider_price_source === 'dtone_api' &&
        providerProductId === id && Number.isFinite(verifiedAt) &&
        verifiedAt <= now && (now - verifiedAt) <= MAX_PROVIDER_PRICE_AGE_MS;
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(wholesale) || wholesale < 1 || !evidenceValid) {
        blockers.push(`Product ${String(product.product_id || 'unknown')} has missing, mismatched, or stale DT One price evidence (maximum age 24 hours).`);
        continue;
      }
      rows.push(Object.freeze({
        productId: id,
        operator: String(product.operator || ''),
        destinationAmount: Number(product.amount),
        destinationCurrency: currency,
        ...calculateCountryProductPrice(wholesale, approvedPolicy),
        stagedActive: false,
      }));
    }
    result.push(Object.freeze({
      countryCode: code,
      destinationCurrency: currency,
      fxRate: fx ? String(fx.quote_per_base) : null,
      fxObservedAt: fx ? fx.observed_at : null,
      fxExpiresAt: fx ? fx.expires_at : null,
      policyVersion: approvedPolicy.version,
      ready: blockers.length === 0 && rows.length > 0,
      blockers: Object.freeze(blockers),
      products: Object.freeze(rows),
      activationPerformed: false,
    }));
  }
  return Object.freeze({
    paymentCurrency: 'EUR',
    policyVersion: approvedPolicy.version,
    countries: Object.freeze(result),
    activationPerformed: false,
    pricesWritten: false,
  });
}

module.exports = {
  SUPPORTED_COUNTRIES,
  MAX_PROVIDER_PRICE_AGE_MS,
  validateMasterPricingPolicy,
  calculateCountryProductPrice,
  buildCountryPricingPreview,
};
