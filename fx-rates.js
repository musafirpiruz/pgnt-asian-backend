'use strict';

const FX_PROVIDER_URL = 'https://api.frankfurter.dev/v2/rates';
const FX_RATE_SOURCE = 'Frankfurter API blended public reference rates';
const COUNTRY_CURRENCIES = Object.freeze({
  AF: 'AFN',
  PK: 'PKR',
  IN: 'INR',
  BD: 'BDT',
});
// Rates are daily business-day observations; allow weekends and public holidays.
const MAX_PROVIDER_AGE_MS = 5 * 24 * 60 * 60 * 1000;

function validateProviderPayload(payload, nowMs = Date.now()) {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('FX provider returned an invalid EUR rates response.');
  }

  const rates = {};
  const providerUpdatedAtByCountry = {};
  for (const [country, currency] of Object.entries(COUNTRY_CURRENCIES)) {
    const row = payload.find((item) =>
      item && item.base === 'EUR' && item.quote === currency
    );
    if (!row || typeof row.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      throw new Error(`FX provider did not return a dated EUR/${currency} rate.`);
    }

    const providerUpdatedAtMs = Date.parse(`${row.date}T00:00:00.000Z`);
    if (!Number.isFinite(providerUpdatedAtMs) ||
        new Date(providerUpdatedAtMs).toISOString().slice(0, 10) !== row.date ||
        providerUpdatedAtMs > nowMs + 5 * 60 * 1000 ||
        nowMs - providerUpdatedAtMs > MAX_PROVIDER_AGE_MS) {
      throw new Error(`FX provider EUR/${currency} rate date is invalid, in the future, or older than five days.`);
    }

    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`FX provider did not return a valid ${currency} rate.`);
    }
    rates[country] = rate;
    providerUpdatedAtByCountry[country] = new Date(providerUpdatedAtMs);
  }

  return { rates, providerUpdatedAtByCountry };
}

async function refreshCountryFxRates(pool, options = {}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('Database pool is required to refresh FX rates.');
  }
  const fetchImpl = options.fetchImpl || global.fetch;
  const now = options.now || (() => Date.now());
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable.');

  const url = new URL(FX_PROVIDER_URL);
  url.searchParams.set('base', 'EUR');
  url.searchParams.set('quotes', Object.values(COUNTRY_CURRENCIES).join(','));

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`FX provider request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  const validated = validateProviderPayload(payload, now());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updatedCountryCount = 0;
    for (const [country, rate] of Object.entries(validated.rates)) {
      const providerUpdatedAt = validated.providerUpdatedAtByCountry[country];
      const updated = await client.query(
        `UPDATE pricing_settings
            SET local_currency_per_eur = $2,
                fx_rate_source = $3,
                fx_updated_at = NOW(),
                fx_provider_updated_at = $4,
                updated_at = NOW()
          WHERE country = $1
          RETURNING country`,
        [country, rate, FX_RATE_SOURCE, providerUpdatedAt]
      );
      if (updated.rowCount !== 1) {
        throw new Error(`FX refresh expected one configured pricing row for country ${country}.`);
      }
      updatedCountryCount += updated.rowCount;
      await client.query(
        `INSERT INTO fx_rate_history
           (country, currency, rate_per_eur, source, provider_updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [country, COUNTRY_CURRENCIES[country], rate, FX_RATE_SOURCE, providerUpdatedAt]
      );
    }
    if (updatedCountryCount !== 4) {
      throw new Error('FX refresh expected exactly four configured country pricing rows.');
    }
    await client.query('COMMIT');
    return {
      updatedCountries: Object.keys(validated.rates),
      rates: validated.rates,
      source: FX_RATE_SOURCE,
      providerUpdatedAtByCountry: Object.fromEntries(
        Object.entries(validated.providerUpdatedAtByCountry).map(([country, date]) =>
          [country, date.toISOString().slice(0, 10)]
        )
      ),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function scheduleCountryFxRefresh(pool, options = {}) {
  const intervalMs = options.intervalMs || 24 * 60 * 60 * 1000;
  let inFlight = false;
  let stopped = false;

  const run = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const result = await refreshCountryFxRates(pool, options);
      (options.logger || console).info('Automatic country FX rates refreshed.', {
        countries: result.updatedCountries,
        source: result.source,
        providerDates: result.providerUpdatedAtByCountry,
      });
    } catch (error) {
      (options.logger || console).error('Automatic country FX refresh failed; saved rates were left unchanged.', error.message);
    } finally {
      inFlight = false;
    }
  };

  // No API key or account is needed for the public Frankfurter endpoint.
  void run();
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

module.exports = {
  COUNTRY_CURRENCIES,
  FX_PROVIDER_URL,
  FX_RATE_SOURCE,
  validateProviderPayload,
  refreshCountryFxRates,
  scheduleCountryFxRefresh,
};
