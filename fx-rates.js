'use strict';

const FX_PROVIDER_URL = 'https://open.er-api.com/v6/latest/EUR';
const COUNTRY_CURRENCIES = Object.freeze({
  AF: 'AFN',
  PK: 'PKR',
  IN: 'INR',
  BD: 'BDT',
});
const MAX_PROVIDER_AGE_MS = 48 * 60 * 60 * 1000;

function validateProviderPayload(payload, nowMs = Date.now()) {
  if (!payload || payload.result !== 'success' || payload.base_code !== 'EUR' ||
      !payload.rates || typeof payload.rates !== 'object') {
    throw new Error('FX provider returned an invalid EUR rate response.');
  }

  const providerUpdatedAt = Number(payload.time_last_update_unix) * 1000;
  if (!Number.isFinite(providerUpdatedAt) ||
      providerUpdatedAt > nowMs + 5 * 60 * 1000 ||
      nowMs - providerUpdatedAt > MAX_PROVIDER_AGE_MS) {
    throw new Error('FX provider rate timestamp is missing, in the future, or older than 48 hours.');
  }

  const rates = {};
  for (const [country, currency] of Object.entries(COUNTRY_CURRENCIES)) {
    const rate = Number(payload.rates[currency]);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`FX provider did not return a valid ${currency} rate.`);
    }
    rates[country] = rate;
  }

  return {
    rates,
    providerUpdatedAt: new Date(providerUpdatedAt),
    nextUpdateAt: Number.isFinite(Number(payload.time_next_update_unix))
      ? new Date(Number(payload.time_next_update_unix) * 1000)
      : null,
  };
}

async function refreshCountryFxRates(pool, options = {}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('Database pool is required to refresh FX rates.');
  }
  const fetchImpl = options.fetchImpl || global.fetch;
  const now = options.now || (() => Date.now());
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable.');

  const response = await fetchImpl(FX_PROVIDER_URL, {
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
    const updated = await client.query(
      `UPDATE pricing_settings
          SET local_currency_per_eur = $2,
              fx_rate_source = $3,
              fx_updated_at = NOW(),
              fx_provider_updated_at = $4,
              updated_at = NOW()
        WHERE country = $1
        RETURNING country`,
      Object.entries(validated.rates).map(([country, rate]) => [country, rate])
    );
    // Use one parameterized update per country to keep the mapping explicit and auditable.
    const updateRows = updated && Array.isArray(updated.rows) ? updated.rows : [];
    if (updateRows.length !== 4) {
      throw new Error('FX refresh expected exactly four configured country pricing rows.');
    }
    for (const [country, rate] of Object.entries(validated.rates)) {
      await client.query(
        `INSERT INTO fx_rate_history
           (country, currency, rate_per_eur, source, provider_updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [country, COUNTRY_CURRENCIES[country], rate, 'ExchangeRate-API Open Access', validated.providerUpdatedAt]
      );
    }
    await client.query('COMMIT');
    return {
      updatedCountries: Object.keys(validated.rates),
      rates: validated.rates,
      source: 'ExchangeRate-API Open Access',
      providerUpdatedAt: validated.providerUpdatedAt.toISOString(),
      nextUpdateAt: validated.nextUpdateAt ? validated.nextUpdateAt.toISOString() : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function scheduleCountryFxRefresh(pool, options = {}) {
  const intervalMs = options.intervalMs || 6 * 60 * 60 * 1000;
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
        providerUpdatedAt: result.providerUpdatedAt,
      });
    } catch (error) {
      (options.logger || console).error('Automatic country FX refresh failed; saved rates were left unchanged.', error.message);
    } finally {
      inFlight = false;
    }
  };

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
  validateProviderPayload,
  refreshCountryFxRates,
  scheduleCountryFxRefresh,
};
