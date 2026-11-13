'use strict';

// DT One product_id is the stable provider identity. Two different provider
// products may legitimately share country/operator/amount/currency (for
// example airtime and data bundles). Never collapse them by denomination.
function denominationKey(product) {
  return [
    String(product.operator || '').trim().toLowerCase(),
    String(Number(product.amount)),
    String(product.currency || '').trim().toUpperCase(),
  ].join('|');
}

function classifyCatalogCandidates(candidates, existingRows) {
  const existingIds = new Set((existingRows || []).map(row => String(row.product_id)));
  const counts = new Map();
  for (const product of candidates || []) {
    const id = String(product.productId);
    counts.set(id, (counts.get(id) || 0) + 1);
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
    if (counts.get(id) > 1) {
      conflicts.push({
        productId: id,
        conflictingProductIds: [id],
        operator: product.operator,
        amount: product.amount,
        currency: product.currency,
        reason: 'The DT One discovery response contains the same provider product ID more than once.',
      });
      continue;
    }
    toInsert.push(product);
  }
  return { alreadyPresent, conflicts, toInsert };
}

module.exports = { classifyCatalogCandidates, denominationKey };
