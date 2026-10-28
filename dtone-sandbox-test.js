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

  app.post('/api/admin/dtone/sandbox-test', requireAdmin, async (req, res) => {
    if (!pool || !DTONE_API_KEY || !DTONE_API_SECRET) {
      return res.status(503).json({
        error: 'Database or DT One credentials are not configured.',
      });
    }

    if (!isPreproduction()) {
      return res.status(403).json({
        error: 'Sandbox test blocked: DT One base URL is not the exact pre-production host.',
      });
    }

    if (req.body?.confirmSandbox !== true) {
      return res.status(400).json({
        error: 'Explicit confirmation required: send confirmSandbox=true.',
      });
    }

    const scenario = String(req.body?.scenario || 'completed').toLowerCase();
    const testPhone = TEST_SCENARIOS[scenario];
    if (!testPhone) {
      return res.status(400).json({
        error: 'scenario must be completed or declined.',
      });
    }

    let orderId;
    try {
      const catalog = await pool.query(
        `SELECT id, product_id, price_eur_cents
         FROM product_catalog
         WHERE country = 'AF'
           AND operator = 'ATOMA'
           AND currency = 'AFN'
           AND product_id = $1
         LIMIT 1`,
        [TEST_PRODUCT_ID]
      );

      if (catalog.rowCount !== 1) {
        return res.status(409).json({
          error: 'The expected ATOMA sandbox product mapping was not found.',
          productId: TEST_PRODUCT_ID,
        });
      }

      orderId = require('crypto').randomUUID();
      await pool.query(
        `INSERT INTO orders (
           order_id, country, operator, phone, amount, currency,
           product_id, product_price_cents, fee_cents, bonus_amount,
           charge_cents, status, dtone_status
         )
         VALUES ($1, 'AF', 'ATOMA-SANDBOX-TEST', $2, 115, 'AFN',
                 $3, $4, 0, 0, $4, 'processing_topup', 'sandbox_test_pending')`,
        [orderId, testPhone, Number(catalog.rows[0].id), Number(catalog.rows[0].price_eur_cents)]
      );

      const response = await fetch(
        `${DTONE_API_BASE_URL}/v1/async/transactions`,
        {
          method: 'POST',
          headers: {
            Authorization: getDtOneAuthHeader(),
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            external_id: orderId,
            product_id: TEST_PRODUCT_ID,
            credit_party_identifier: { mobile_number: testPhone },
            auto_confirm: true,
            callback_url: DTONE_CALLBACK_URL,
          }),
          signal: AbortSignal.timeout(25000),
        }
      );

      const responseText = await response.text();
      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch (_) {
        data = null;
      }

      if (!response.ok) {
        await pool.query(
          `UPDATE orders
           SET status = 'topup_review', dtone_status = 'sandbox_test_http_error',
               dtone_error = $1, updated_at = NOW()
           WHERE order_id = $2 AND status = 'processing_topup'`,
          [`DT One sandbox returned HTTP ${response.status}`, orderId]
        );
        console.warn('DT One sandbox test rejected with HTTP', response.status);
        return res.status(502).json({
          created: false,
          orderId,
          providerStatus: response.status,
          error: 'DT One rejected the sandbox transaction. The test order is retained for review; do not retry blindly.',
        });
      }

      const providerId = data?.id ?? data?.transaction_id ?? null;
      const providerStatus = typeof data?.status === 'string'
        ? data.status
        : (data?.status?.message || data?.status?.class || 'submitted');

      const savedOrder = await pool.query(
        `UPDATE orders
         SET dtone_transaction_id = COALESCE($1, dtone_transaction_id),
             dtone_status = $2,
             status = CASE WHEN status = 'processing_topup'
                           THEN 'topup_submitted' ELSE status END,
             updated_at = NOW()
         WHERE order_id = $3 AND status IN ('processing_topup', 'topup_submitted', 'completed', 'topup_review')`,
        [providerId === null ? null : String(providerId), String(providerStatus).slice(0, 80), orderId]
      );

      // DT One may already have accepted the sandbox transaction. Never return
      // a normal accepted response unless its result was saved against the
      // matching local order. The catch path marks the order for reconciliation
      // where possible and warns operators not to retry blindly.
      if (savedOrder.rowCount !== 1) {
        throw new Error('DT One accepted the sandbox transaction but its result could not be saved to the expected order.');
      }

      return res.status(202).json({
        created: true,
        sandboxOnly: true,
        scenario,
        orderId,
        providerTransactionId: providerId,
        providerStatus,
        phoneSuffix: testPhone.slice(-3),
        note: 'No Stripe payment was created. Check this order status and the DT One callback before considering the callback flow verified.',
      });
    } catch (error) {
      console.error('DT One sandbox test failed:', error.message);
      if (orderId) {
        try {
          await pool.query(
            `UPDATE orders
             SET status = 'topup_review',
                 dtone_status = 'sandbox_test_outcome_unknown',
                 dtone_error = 'Sandbox request outcome unknown; reconcile before retrying.',
                 updated_at = NOW()
             WHERE order_id = $1 AND status = 'processing_topup'`,
            [orderId]
          );
        } catch (_) {}
      }
      return res.status(502).json({
        created: false,
        orderId: orderId || null,
        error: 'Sandbox request outcome is unknown. Check the saved order and DT One dashboard before attempting another test.',
      });
    }
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
