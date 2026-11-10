'use strict';

// Canonical reference-FX observation selector.
// This helper does not fetch rates, write pricing, or activate a country.
function resolveApprovedFxObservation(rows, expectedCurrency, options = {}) {
  const currency = String(expectedCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('A valid destination currency is required for FX lookup.');
  if (!Array.isArray(rows)) throw new Error('FX observations must be supplied as an array.');
  const nowMs = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? 5 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new Error('FX lookup time and freshness window must be valid.');
  }
  const candidates = rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    if (String(row.base_currency || '').trim().toUpperCase() !== 'EUR') return false;
    if (String(row.quote_currency || '').trim().toUpperCase() !== currency) return false;
    if (row.is_approved !== true && row.is_approved !== 'true') return false;
    const rate = Number(row.quote_per_base);
    const observedAt = Date.parse(row.observed_at);
    const expiresAt = Date.parse(row.expires_at);
    return Number.isFinite(rate) && rate > 0 && Number.isFinite(observedAt) &&
      Number.isFinite(expiresAt) && observedAt <= nowMs && expiresAt > nowMs &&
      nowMs - observedAt <= maxAgeMs;
  });
  if (candidates.length === 0) throw new Error(`No approved, current EUR/${currency} reference rate is available.`);
  candidates.sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
  const newestAt = Date.parse(candidates[0].observed_at);
  const newest = candidates.filter((row) => Date.parse(row.observed_at) === newestAt);
  if (new Set(newest.map((row) => Number(row.quote_per_base))).size !== 1) {
    throw new Error(`Conflicting approved EUR/${currency} rates share the newest observation timestamp.`);
  }
  const selected = newest[0];
  return Object.freeze({
    baseCurrency: 'EUR',
    quoteCurrency: currency,
    quotePerBase: Number(selected.quote_per_base),
    source: String(selected.source || ''),
    sourceReference: selected.source_reference == null ? null : String(selected.source_reference),
    observedAt: new Date(newestAt).toISOString(),
    expiresAt: new Date(Date.parse(selected.expires_at)).toISOString(),
  });
}
module.exports = { resolveApprovedFxObservation };
