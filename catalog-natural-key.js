'use strict';

// Classify fixed-denomination products before importing into the legacy catalog.
// Until the natural-key database constraint is migrated, never choose one of
// several DT One products sharing the same country/operator/amount/currency.
function denominationKey(product) {
  return [
    String(product.operator || '').trim().toLowerCase(),
    String(Number(product.amount)),
    String(product.currency || '').trim().toUpperCase(),
  ].join('|');
}

function classifyCatalogCandidates(candidates, existingRows) {
  const existingIds = new Set((existingRows || []).map(row => String(row.product_id)));
  const existingByKey = new Map();
  for (const row of existingRows || []) {
    const key = denominationKey(row);
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(String(row.product_id));
  }

  const candidateGroups = new Map();
  for (const product of candidates || []) {
    const key = denominationKey(product);
    if (!candidateGroups.has(key)) candidateGroups.set(key, []);
    candidateGroups.get(key).push(product);
  }

  const alreadyPresent = [];
  const conflicts = [];
  const toInsert = [];
  for (const product of candidates || []) {
    const id = String(product.productId);
    if (existingIds.has(id)) {
      alreadyPresent.push(id);
      continue;
    }
    const key = denominationKey(product);
    const storedIds = existingByKey.get(key) || [];
    const peerIds = (candidateGroups.get(key) || [])
      .filter(peer => String(peer.productId) !== id)
      .map(peer => String(peer.productId));
    const conflictingIds = [...new Set([...storedIds, ...peerIds])];
    if (conflictingIds.length) {
      conflicts.push({
        productId: id,
        conflictingProductIds: conflictingIds,
        operator: product.operator,
        amount: product.amount,
        currency: product.currency,
        reason: 'Same operator and denomination has another DT One product ID; manual review required.',
      });
      continue;
    }
    toInsert.push(product);
  }
  return { alreadyPresent, conflicts, toInsert };
}

module.exports = { classifyCatalogCandidates, denominationKey };
