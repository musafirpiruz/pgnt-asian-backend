'use strict';

const SUPPORTED_CURRENCIES = Object.freeze({ AF: 'AFN', PK: 'PKR', IN: 'INR', BD: 'BDT' });

/**
 * Select only rows belonging to the exact stable country/operator mapping.
 * Product price evidence must be positive EUR wholesale cents and a numeric
 * DT One product ID. This helper never toggles customer-facing active flags.
 */
function selectEligibleNetworkProducts(rows, { countryCode, operatorKey, sourceCatalogId }) {
  const country = String(countryCode || '').trim().toUpperCase();
  const key = String(operatorKey || '').trim();
  const currency = SUPPORTED_CURRENCIES[country];
  if (!currency || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(key)) {
    throw new Error('A supported country and stable operator key are required.');
  }
  const sourceId = Number(sourceCatalogId);
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
    throw new Error('A valid source catalog product is required.');
  }
  const eligible = [];
  const blocked = [];
  for (const row of rows || []) {
    const sameNetwork = String(row.country_code || '').trim().toUpperCase() === country &&
      String(row.operator_key || '') === key;
    if (!sameNetwork) continue;
    const catalogId = Number(row.product_catalog_id);
    const providerProductId = Number(row.provider_product_id);
    const wholesale = Number(row.wholesale_price_eur_cents);
    const valid = Number.isSafeInteger(catalogId) && catalogId > 0 &&
      Number.isSafeInteger(providerProductId) && providerProductId > 0 &&
      Number.isSafeInteger(wholesale) && wholesale > 0 &&
      String(row.currency || '').trim().toUpperCase() === currency &&
      String(row.product_country || '').trim().toUpperCase() === country &&
      String(row.operator || '') === String(row.operator_name || '');
    const item = {
      mappingId: Number(row.mapping_id),
      productCatalogId: catalogId,
      providerProductId,
      wholesalePriceEurCents: wholesale,
    };
    if (valid && Number.isSafeInteger(item.mappingId) && item.mappingId > 0) eligible.push(item);
    else blocked.push({ productCatalogId: Number.isSafeInteger(catalogId) ? catalogId : null, reason: 'Missing or inconsistent DT One product, operator, currency, or EUR wholesale evidence.' });
  }
  if (!eligible.some(item => item.productCatalogId === sourceId)) {
    throw new Error('The selected source product is not eligible for this exact network.');
  }
  return Object.freeze({
    countryCode: country,
    operatorKey: key,
    sourceProductCatalogId: sourceId,
    eligible: Object.freeze(eligible),
    blocked: Object.freeze(blocked),
    customerProductsActivated: false,
    catalogPricesWritten: false,
  });
}

module.exports = { selectEligibleNetworkProducts };
