'use strict';

const ISO_COUNTRY = /^[A-Z]{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const CALLING_CODE = /^\+[1-9]\d{0,3}$/;
const PROVIDER_CODE = /^[A-Z0-9_-]{2,8}$/;

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 15) {
    throw new Error(`Invalid ${field} in country registry.`);
  }
  return number;
}

/**
 * Convert validated active country_registry rows into immutable customer config.
 * Only ACTIVE rows with a verified provider country mapping are exposed.
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
    const provider = String(row.provider || '').trim().toLowerCase();
    const providerCountryCode = String(row.provider_country_code || '').trim().toUpperCase();

    if (status !== 'active') continue;
    if (!ISO_COUNTRY.test(code)) throw new Error('Invalid country code in active country registry.');
    if (!name || name.length > 120) throw new Error(`Invalid country name for ${code}.`);
    if (!ISO_CURRENCY.test(currency)) throw new Error(`Invalid destination currency for ${code}.`);
    if (!CALLING_CODE.test(callingCode)) throw new Error(`Invalid calling code for ${code}.`);
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(provider)) throw new Error(`Invalid provider for ${code}.`);
    if (!PROVIDER_CODE.test(providerCountryCode)) throw new Error(`Invalid provider country mapping for ${code}.`);

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
      provider,
      providerCountryCode,
      configurationVersion: version,
    });
  }

  return Object.freeze(countries);
}

async function loadActiveCountryConfig(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool is required to load country registry.');
  }
  const result = await pool.query(
    `SELECT country_code, country_name, destination_currency, calling_code,
            provider, provider_country_code, phone_min_digits, phone_max_digits,
            status, configuration_version
       FROM country_registry
      WHERE status = 'active'
      ORDER BY country_code`
  );
  return buildActiveCountryConfig(result.rows);
}

module.exports = { buildActiveCountryConfig, loadActiveCountryConfig };
