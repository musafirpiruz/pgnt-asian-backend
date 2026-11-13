'use strict';

const { loadActiveCountryConfig } = require('./country-registry');

/**
 * Atomic in-process snapshot manager for the active country registry.
 * A refresh publishes only a fully validated snapshot. Failed refreshes keep
 * the last known-good snapshot; callers must still decide whether it is fresh
 * enough for a security-sensitive operation.
 */
function createCountryRegistryRuntime({ pool, loader = loadActiveCountryConfig, now = Date.now } = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool is required for country registry runtime.');
  }
  if (typeof loader !== 'function') throw new TypeError('Country registry loader must be a function.');
  if (typeof now !== 'function') throw new TypeError('Clock must be a function.');

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
      // Publish atomically only after the complete load and validation succeeds.
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

  return Object.freeze({ refresh, getSnapshot });
}

module.exports = { createCountryRegistryRuntime };
