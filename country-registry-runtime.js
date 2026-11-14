'use strict';

const { loadActiveCountryConfig } = require('./country-registry');

/**
 * Atomic snapshot manager. Security-sensitive callers use getFreshSnapshot:
 * it refreshes stale data and fails closed if refresh cannot be completed.
 * A last-known-good snapshot remains available for diagnostics only.
 */
function createCountryRegistryRuntime({
  pool,
  loader = loadActiveCountryConfig,
  now = Date.now,
  maxAgeMs = 60_000,
} = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool is required for country registry runtime.');
  }
  if (typeof loader !== 'function') throw new TypeError('Country registry loader must be a function.');
  if (typeof now !== 'function') throw new TypeError('Clock must be a function.');
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) {
    throw new TypeError('Country registry maxAgeMs must be a positive integer.');
  }

  let snapshot = null;
  let refreshedAt = null;
  let inFlight = null;

  async function refresh() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const next = await loader(pool);
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        throw new Error('Country registry loader returned an invalid snapshot.');
      }
      snapshot = next;
      refreshedAt = now();
      return Object.freeze({ countries: snapshot, refreshedAt });
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function getSnapshot() {
    if (!snapshot) return null;
    return Object.freeze({ countries: snapshot, refreshedAt });
  }

  async function getFreshSnapshot() {
    const current = getSnapshot();
    const currentTime = now();
    if (current && Number.isFinite(currentTime)
        && currentTime >= current.refreshedAt
        && currentTime - current.refreshedAt < maxAgeMs) {
      return current;
    }
    // Do not use a stale last-known-good snapshot for payments or sellability.
    return refresh();
  }

  return Object.freeze({ refresh, getSnapshot, getFreshSnapshot });
}

module.exports = { createCountryRegistryRuntime };
