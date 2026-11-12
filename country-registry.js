'use strict';

const ISO_COUNTRY = /^[A-Z]{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const CALLING_CODE = /^\+[1-9]\d{0,3}$/;

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 15) {
    throw new Error(`Invalid ${field} in country registry.`);
  }
  return number;
}

/**
 * Convert validated active country_registry rows into the immutable shape
 * consumed by country validation. Only ACTIVE rows are exposed to customers.
 * This pure mapper deliberately performs no database access or activation.
 */
function buildActiveCountryConfig(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Country registry rows must be an array.');

  const countries = Object.create(null);
  for (const row of rows) {
    const code = String(row.country_code || '').trim().toUpperCase();
    const name = String(row.country_name || '').trim();
    const currency = String(row.destination_currency || '').trim().toUpperCase();
    const callingCode = String(row.calling_code || '').trim();
    const status = String(row.status || '').trim().toLowerCase();

    if (status !== 'active') continue;
    if (!ISO_COUNTRY.test(code)) throw new Error('Invalid country code in active country registry.');
    if (!name || name.length > 120) throw new Error(`Invalid country name for ${code}.`);
    if (!ISO_CURRENCY.test(currency)) throw new Error(`Invalid destination currency for ${code}.`);
    if (!CALLING_CODE.test(callingCode)) throw new Error(`Invalid calling code for ${code}.`);

    const minDigits = positiveInteger(row.phone_min_digits, 'phone_min_digits');
    const maxDigits = positiveInteger(row.phone_max_digits, 'phone_max_digits');
    if (maxDigits < minDigits) throw new Error(`Invalid phone digit range for ${code}.`);

    const version = Number(row.configuration_version);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error(`Invalid configuration version for ${code}.`);
    }
    if (countries[code]) throw new Error(`Duplicate active country registry row for ${code}.`);

    countries[code] = Object.freeze({
      name,
      currency,
      phoneDigits: Object.freeze([minDigits, maxDigits]),
      callingCode,
      configurationVersion: version,
    });
  }

  return Object.freeze(countries);
}

module.exports = { buildActiveCountryConfig };
