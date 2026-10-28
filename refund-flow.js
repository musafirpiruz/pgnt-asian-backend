'use strict';

// Executes the external Stripe refund only after the caller has committed a
// unique pending reservation. Injected dependencies make failure paths testable.
async function executeReservedRefund({ client, stripe, order, orderId, reason, logger = console }) {
  let refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: { orderId, adminReason: reason },
      },
      { idempotencyKey: `pgnt-refund-${orderId}` }
    );
  } catch (stripeError) {
    // An ambiguous Stripe result must never erase the already-committed
    // reservation. If recording needs_review fails, pending still blocks retry.
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(
        `UPDATE refunds SET status = 'needs_review', reason = $1 WHERE order_id = $2`,
        [`Stripe outcome needs reconciliation: ${String(stripeError.message || 'unknown error').slice(0, 350)}`, orderId]
      );
      await client.query('COMMIT');
      transactionOpen = false;
    } catch (stateError) {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      logger.error('Could not persist Stripe refund reconciliation state:', stateError.message);
    }
    logger.error('Stripe refund outcome requires reconciliation:', stripeError.message);
    return { kind: 'needs_review' };
  }

  // Do not mark the order refunded unless Stripe confirms a full EUR refund
  // matching the original captured charge. A prior partial refund or an
  // unexpected currency must be reconciled manually rather than treated as paid back.
  const refundMatchesOrder =
    Number(refund.amount) === Number(order.charge_cents) &&
    String(refund.currency || '').toLowerCase() === 'eur';
  const normalizedRefundStatus = String(refund.status || '').toLowerCase();
  const needsReview = !refundMatchesOrder ||
    !['succeeded', 'pending'].includes(normalizedRefundStatus);
  const persistedStatus = needsReview ? 'needs_review' : normalizedRefundStatus;
  const persistedReason = !refundMatchesOrder
    ? `Stripe refund mismatch: expected ${Number(order.charge_cents)} EUR cents; received ${Number(refund.amount)} ${String(refund.currency || 'unknown').toUpperCase()}. Manual reconciliation required.`
    : needsReview
      ? `Stripe refund returned status ${normalizedRefundStatus || 'unknown'}; manual reconciliation required.`
      : reason;

  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const refundUpdate = await client.query(
      `UPDATE refunds SET stripe_refund_id = $1, amount_cents = $2,
         status = $3, reason = $4 WHERE order_id = $5`,
      [refund.id, refund.amount, persistedStatus, persistedReason, orderId]
    );
    if (refundUpdate.rowCount !== 1) {
      throw new Error('Refund reservation disappeared before finalization; reconciliation required.');
    }

    let orderUpdate;
    if (normalizedRefundStatus === 'succeeded' && !needsReview) {
      orderUpdate = await client.query(
        `UPDATE orders SET status = 'refunded',
           refunded_at = COALESCE(refunded_at, NOW()), updated_at = NOW()
         WHERE order_id = $1 AND status = 'topup_review'`,
        [orderId]
      );
    } else {
      orderUpdate = await client.query(
        `UPDATE orders SET status = 'topup_review', updated_at = NOW()
         WHERE order_id = $1 AND status = 'topup_review'`,
        [orderId]
      );
    }
    if (orderUpdate.rowCount !== 1) {
      throw new Error('Order status was not updated during refund finalization; reconciliation required.');
    }

    await client.query('COMMIT');
    transactionOpen = false;
    if (needsReview) return { kind: 'needs_review', refund };
    if (normalizedRefundStatus === 'pending') return { kind: 'pending', refund };
    return { kind: 'completed', refund };
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    // The initial reservation was committed by the route before this helper
    // runs, so a failed finalization cannot remove it.
    throw error;
  }
}

module.exports = { executeReservedRefund };
