'use strict';

const DEFAULT_REQUIRED_LANGUAGES = Object.freeze(['en', 'ps', 'fa', 'ur', 'hi', 'bn']);

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Pure fail-closed country activation gate.
 * The caller must supply facts read from canonical DB/provider records.
 * This helper does not write status, call providers, or activate anything.
 */
function evaluateCountryActivation(input = {}) {
  const blockers = [];
  const country = input.country || {};
  const operators = Array.isArray(input.operators) ? input.operators : [];
  const products = Array.isArray(input.products) ? input.products : [];
  const localizations = Array.isArray(input.localizations) ? input.localizations : [];
  const pricing = input.pricing || {};
  const fx = input.fx || {};
  const sandboxChecks = Array.isArray(input.sandboxChecks) ? input.sandboxChecks : [];
  const requiredLanguages = Array.isArray(input.requiredLanguages) && input.requiredLanguages.length
    ? input.requiredLanguages
    : DEFAULT_REQUIRED_LANGUAGES;

  if (!['testing', 'configuring'].includes(String(country.status || '').toLowerCase())) {
    blockers.push('countryMustBeInTestingOrConfiguring');
  }
  if (!/^[A-Z]{2}$/.test(String(country.countryCode || ''))) blockers.push('invalidCountryCode');
  if (!/^[A-Z]{3}$/.test(String(country.destinationCurrency || ''))) blockers.push('invalidDestinationCurrency');
  if (!/^\+[1-9]\d{0,3}$/.test(String(country.callingCode || ''))) blockers.push('invalidCallingCode');
  if (!Number.isInteger(country.phoneMinDigits) || !Number.isInteger(country.phoneMaxDigits)
      || country.phoneMinDigits < 1 || country.phoneMaxDigits < country.phoneMinDigits
      || country.phoneMaxDigits > 15) blockers.push('invalidPhoneNumberRules');
  if (!nonBlank(country.provider) || !nonBlank(country.providerCountryCode)) blockers.push('providerCountryMappingUnverified');

  const verifiedOperators = operators.filter(operator =>
    operator && operator.active === true && operator.verified === true
      && nonBlank(operator.providerOperatorId));
  if (verifiedOperators.length === 0) blockers.push('noActiveVerifiedOperator');

  const verifiedProducts = products.filter(product =>
    product && product.active === true && product.verified === true
      && nonBlank(product.providerProductId)
      && String(product.currency || '').toUpperCase() === String(country.destinationCurrency || '').toUpperCase()
      && Number.isFinite(Number(product.wholesaleCostMinor)) && Number(product.wholesaleCostMinor) > 0
      && nonBlank(product.wholesaleCurrency));
  if (verifiedProducts.length === 0) blockers.push('noActiveVerifiedPricedProduct');

  const languageSet = new Set(localizations.filter(item => item && nonBlank(item.languageCode)
    && nonBlank(item.displayName)).map(item => item.languageCode.toLowerCase()));
  const missingLanguages = requiredLanguages.filter(language => !languageSet.has(String(language).toLowerCase()));
  if (missingLanguages.length) blockers.push('missingLocalizations:' + missingLanguages.join(','));

  if (pricing.active !== true || String(pricing.paymentCurrency || '').toUpperCase() !== 'EUR'
      || !Number.isFinite(Number(pricing.feeCents)) || Number(pricing.feeCents) < 0
      || !Number.isFinite(Number(pricing.minimumMarginCents)) || Number(pricing.minimumMarginCents) < 0) {
    blockers.push('invalidOrInactiveEurPricing');
  }
  if (fx.fresh !== true || String(fx.baseCurrency || '').toUpperCase() !== 'EUR'
      || String(fx.destinationCurrency || '').toUpperCase() !== String(country.destinationCurrency || '').toUpperCase()
      || !Number.isFinite(Number(fx.rate)) || Number(fx.rate) <= 0) {
    blockers.push('missingStaleOrMismatchedFxRate');
  }

  const requiredSandboxChecks = ['providerConnectivity', 'sampleQuote', 'successCallback', 'failureCallback'];
  const nowValue = input.now === undefined ? Date.now() : new Date(input.now).getTime();
  const maxEvidenceAgeMs = 30 * 24 * 60 * 60 * 1000;
  const approvedFreshChecks = new Set();
  for (const check of sandboxChecks) {
    if (!check || check.passed !== true || check.reviewStatus !== 'approved') continue;
    const verifiedAtMs = typeof check.verifiedAt === 'number'
      ? check.verifiedAt
      : Date.parse(check.verifiedAt);
    if (!Number.isFinite(verifiedAtMs) || !Number.isFinite(nowValue)
        || verifiedAtMs > nowValue || nowValue - verifiedAtMs > maxEvidenceAgeMs) continue;
    approvedFreshChecks.add(check.name);
  }
  const missingSandboxChecks = requiredSandboxChecks.filter(name => !approvedFreshChecks.has(name));
  if (missingSandboxChecks.length) {
    blockers.push('sandboxChecksMissingApprovedFreshEvidence:' + missingSandboxChecks.join(','));
  }

  return Object.freeze({
    eligible: blockers.length === 0,
    blockers: Object.freeze(blockers),
    verifiedOperatorCount: verifiedOperators.length,
    verifiedProductCount: verifiedProducts.length,
    missingLanguages: Object.freeze(missingLanguages),
    requiredSandboxChecks: Object.freeze(requiredSandboxChecks),
  });
}

module.exports = { DEFAULT_REQUIRED_LANGUAGES, evaluateCountryActivation };
