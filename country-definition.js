'use strict';

// Country definitions are data, not country-specific application branches.
// The database country_registry remains the runtime source of truth. This
// pure validator is shared by import/admin workflows and deliberately does
// not activate countries or infer provider identifiers.
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const CALLING_CODE = /^\+[1-9]\d{0,3}$/;

function validateCountryDefinition(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['country_definition_required'], normalized: null };
  }

  const code = String(input.countryCode || '').trim().toUpperCase();
  const currency = String(input.destinationCurrency || '').trim().toUpperCase();
  const callingCode = String(input.callingCode || '').trim();
  const provider = String(input.provider || '').trim().toLowerCase();
  const providerCountryCode = input.providerCountryCode == null
    ? null : String(input.providerCountryCode).trim();
  const minDigits = Number(input.phoneMinDigits);
  const maxDigits = Number(input.phoneMaxDigits);
  const languages = Array.isArray(input.languages) ? input.languages : [];

  if (!COUNTRY_CODE.test(code)) errors.push('invalid_iso_country_code');
  if (!String(input.countryName || '').trim() || String(input.countryName).trim().length > 120) {
    errors.push('invalid_country_name');
  }
  if (!CURRENCY_CODE.test(currency)) errors.push('invalid_iso_currency_code');
  if (!CALLING_CODE.test(callingCode)) errors.push('invalid_international_calling_code');
  if (!Number.isInteger(minDigits) || minDigits < 1 || minDigits > 15) {
    errors.push('invalid_phone_min_digits');
  }
  if (!Number.isInteger(maxDigits) || maxDigits < minDigits || maxDigits > 15) {
    errors.push('invalid_phone_max_digits');
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(provider)) errors.push('invalid_provider_key');
  if (providerCountryCode === null || !/^[A-Z0-9_-]{2,8}$/.test(providerCountryCode)) {
    errors.push('invalid_provider_country_code');
  }
  if (!languages.length || languages.length > 20) errors.push('invalid_language_list');
  const normalizedLanguages = languages.map((value) => String(value || '').trim());
  if (normalizedLanguages.some((value) => !LANGUAGE_CODE.test(value))) {
    errors.push('invalid_language_code');
  }
  if (new Set(normalizedLanguages).size !== normalizedLanguages.length) {
    errors.push('duplicate_language_code');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: errors.length ? null : {
      countryCode: code,
      countryName: String(input.countryName).trim(),
      destinationCurrency: currency,
      callingCode,
      phoneMinDigits: minDigits,
      phoneMaxDigits: maxDigits,
      provider,
      providerCountryCode,
      languages: normalizedLanguages,
    },
  };
}

function validateCountryRegistry(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return { valid: false, errors: ['country_registry_must_be_non_empty'], countries: [] };
  }
  const countries = [];
  const errors = [];
  const seenCodes = new Set();
  for (let index = 0; index < definitions.length; index += 1) {
    const result = validateCountryDefinition(definitions[index]);
    if (!result.valid) {
      errors.push({ index, errors: result.errors });
      continue;
    }
    const code = result.normalized.countryCode;
    if (seenCodes.has(code)) errors.push({ index, errors: ['duplicate_country_code'] });
    seenCodes.add(code);
    countries.push(result.normalized);
  }
  return { valid: errors.length === 0, errors, countries: errors.length ? [] : countries };
}

module.exports = { validateCountryDefinition, validateCountryRegistry };
