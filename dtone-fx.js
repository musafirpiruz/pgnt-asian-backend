'use strict';

// DT One product discovery is the only accepted FX source for this path.
// DT One's rates.wholesale is destination-currency units per source-currency
// unit. We accept it only when the product source unit is EUR and the
// destination unit is the exact expected country currency.
function buildDtOneFxObservation(product, expectedCurrency, options = {}) {
  const currency = String(expectedCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('A valid destination currency is required for DT One FX.');
  }
  if (!product || typeof product !== 'object' || !Number.isSafeInteger(Number(product.id)) || Number(product.id) <= 0) {
    throw new Error('A valid DT One product is required for FX extraction.');
  }

  const sourceCurrency = String(product.source?.unit || '').trim().toUpperCase();
  const destinationCurrency = String(product.destination?.unit || '').trim().toUpperCase();
  if (sourceCurrency !== 'EUR') {
    throw new Error('DT One product source currency is not EUR; refusing to convert it as an EUR rate.');
  }
  if (destinationCurrency !== currency) {
    throw new Error(`DT One product destination currency does not match expected ${currency}.`);
  }

  const rate = Number(product.rates?.wholesale);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('DT One product has no valid wholesale FX rate.');
  }

  const observedAt = options.observedAt ? new Date(options.observedAt) : new Date();
  const ttlMs = Number(options.ttlMs ?? 24 * 60 * 60 * 1000);
  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('DT One FX observation time and TTL must be valid.');
  }
  const expiresAt = new Date(observedAt.getTime() + ttlMs);
  const operatorId = Number(product.operator?.id);
  return Object.freeze({
    baseCurrency: 'EUR',
    quoteCurrency: currency,
    quotePerBase: rate,
    source: 'DT_ONE',
    sourceReference: `product:${Number(product.id)}${Number.isSafeInteger(operatorId) && operatorId > 0 ? `:operator:${operatorId}` : ''}`,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}

module.exports = { buildDtOneFxObservation };
