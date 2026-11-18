'use strict';

// Explicitly isolated DT One pre-production test route.
// Never activates catalog entries or creates Stripe payments.
module.exports = function registerDtOneSandboxTest({
  app,
  pool,
  requireAdmin,
  DTONE_API_KEY,
  DTONE_API_SECRET,
  DTONE_API_BASE_URL,
  DTONE_CALLBACK_URL,
  getDtOneAuthHeader,
}) {
  const PREPROD_HOST = 'preprod-dvs-api.dtone.com';
  const TEST_PRODUCT_ID = 7194;
  const TEST_SCENARIOS = Object.freeze({
    completed: '+93700100100',
    declined: '+93700100106',
  });

  function isPreproduction() {
    try {
      const url = new URL(DTONE_API_BASE_URL);
      return url.protocol === 'https:' && url.hostname === PREPROD_HOST &&
        (url.pathname === '' || url.pathname === '/');
    } catch (_) {
      return false;
    }
  }

  // Legacy fixed-price sandbox transaction creation is deliberately disabled.
  // The previous implementation hard-coded product 7194 / 115 AFN and could
  // create provider transactions from outdated catalog data. Do not re-enable
  // until the new master catalog is imported, independently verified and
  // selected explicitly by product ID and destination amount.
  app.post('/api/admin/dtone/sandbox-test', requireAdmin, async (_req, res) => {
    return res.status(410).json({
      created: false,
      sandboxOnly: true,
      legacyRouteDisabled: true,
      error: 'Legacy fixed-price sandbox tests are disabled. Import and verify the new master catalog before creating any new sandbox order.',
    });
  });

  app.get('/api/admin/dtone/sandbox-test/:orderId', requireAdmin, async (req, res) => {
    if (!pool) {
      return res.status(503).json({ error: 'Database is not configured.' });
    }

    const orderId = String(req.params.orderId || '');
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return res.status(400).json({ error: 'Invalid test order ID.' });
    }

    try {
      const result = await pool.query(
        `SELECT order_id, operator, amount, currency, status,
                dtone_transaction_id, dtone_status, dtone_error,
                dtone_callback_payload, created_at, updated_at
         FROM orders
         WHERE order_id = $1
           AND operator = 'ATOMA-SANDBOX-TEST'
         LIMIT 1`,
        [orderId]
      );

      if (result.rowCount !== 1) {
        return res.status(404).json({ error: 'Sandbox test order not found.' });
      }

      const order = result.rows[0];

      // Repair legacy sandbox rows created before callback status serialization
      // was fixed. This only touches the isolated ATOMA-SANDBOX-TEST record.
      if (order.dtone_status === '[object Object]' &&
          order.dtone_callback_payload &&
          Object.prototype.hasOwnProperty.call(order.dtone_callback_payload, 'status')) {
        const rawStatus = order.dtone_callback_payload.status;
        const serializedStatus = typeof rawStatus === 'string'
          ? rawStatus
          : JSON.stringify(rawStatus ?? 'unknown');

        const repaired = await pool.query(
          `UPDATE orders
           SET dtone_status = $1, updated_at = NOW()
           WHERE order_id = $2
             AND operator = 'ATOMA-SANDBOX-TEST'
             AND dtone_status = '[object Object]'
           RETURNING order_id, operator, amount, currency, status,
                     dtone_transaction_id, dtone_status, dtone_error,
                     dtone_callback_payload, created_at, updated_at`,
          [String(serializedStatus).slice(0, 500), orderId]
        );

        if (repaired.rowCount === 1) {
          return res.json({ sandboxOnly: true, repairedLegacyStatus: true, order: repaired.rows[0] });
        }
      }

      return res.json({
        sandboxOnly: true,
        order,
      });
    } catch (error) {
      console.error('DT One sandbox test status lookup failed:', error.message);
      return res.status(500).json({ error: 'Could not load sandbox test status.' });
    }
  });
};
