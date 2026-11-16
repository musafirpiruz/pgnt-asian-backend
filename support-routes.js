'use strict';

const crypto = require('node:crypto');

const ORDER_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const ACCESS_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const TICKET_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const TICKET_CATEGORIES = new Set(['payment', 'topup', 'refund', 'wallet', 'account', 'other']);

function tokenMatches(accessToken, storedHash) {
  if (!ACCESS_TOKEN_PATTERN.test(accessToken) || typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }
  const suppliedHash = crypto.createHash('sha256').update(accessToken, 'utf8').digest();
  const expectedHash = Buffer.from(storedHash, 'hex');
  return suppliedHash.length === expectedHash.length && crypto.timingSafeEqual(suppliedHash, expectedHash);
}

module.exports = function registerSupportRoutes({ app, pool, requireAdmin }) {
  // Customers can submit a ticket only when they prove access to the related order.
  // This avoids exposing a public ticket inbox without customer authentication.
  app.post('/api/support/tickets', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Support service is not configured.' });

    const orderId = String(req.body?.orderId || '').trim();
    const accessToken = String(req.get('x-order-access-token') || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    const category = String(req.body?.category || 'other').trim().toLowerCase();

    if (!ORDER_ID_PATTERN.test(orderId)) return res.status(400).json({ error: 'A valid orderId is required.' });
    if (!ACCESS_TOKEN_PATTERN.test(accessToken)) return res.status(401).json({ error: 'Valid order access is required.' });
    if (subject.length < 4 || subject.length > 160) return res.status(400).json({ error: 'Subject must be 4-160 characters.' });
    if (message.length < 10 || message.length > 4000) return res.status(400).json({ error: 'Message must be 10-4000 characters.' });
    if (!TICKET_CATEGORIES.has(category)) return res.status(400).json({ error: 'Unsupported support category.' });

    try {
      const orderResult = await pool.query(
        'SELECT order_id, order_access_token_hash FROM orders WHERE order_id = $1 LIMIT 1',
        [orderId]
      );
      if (orderResult.rowCount !== 1 || !tokenMatches(accessToken, orderResult.rows[0].order_access_token_hash)) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const inserted = await pool.query(
        `INSERT INTO support_tickets (order_id, subject, message, category, status, priority)
         VALUES ($1, $2, $3, $4, 'open', 'normal')
         RETURNING id, order_id, subject, message, category, status, priority, admin_reply, created_at, updated_at`,
        [orderId, subject, message, category]
      );
      return res.status(201).json({ ticket: inserted.rows[0] });
    } catch (error) {
      console.error('Support ticket creation failed:', error.message);
      return res.status(500).json({ error: 'Could not create support ticket.' });
    }
  });

  // Customer ticket history and admin replies are protected by the same per-order token.
  app.get('/api/support/tickets/order/:orderId', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Support service is not configured.' });

    const orderId = String(req.params.orderId || '').trim();
    const accessToken = String(req.get('x-order-access-token') || '').trim();
    if (!ORDER_ID_PATTERN.test(orderId)) return res.status(400).json({ error: 'Invalid order ID.' });
    if (!ACCESS_TOKEN_PATTERN.test(accessToken)) return res.status(401).json({ error: 'Valid order access is required.' });

    try {
      const orderResult = await pool.query(
        'SELECT order_access_token_hash FROM orders WHERE order_id = $1 LIMIT 1',
        [orderId]
      );
      if (orderResult.rowCount !== 1 || !tokenMatches(accessToken, orderResult.rows[0].order_access_token_hash)) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      const result = await pool.query(
        `SELECT id, order_id, subject, message, category, status, priority, admin_reply, created_at, updated_at
         FROM support_tickets WHERE order_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [orderId]
      );
      return res.json({ tickets: result.rows });
    } catch (error) {
      console.error('Support ticket lookup failed:', error.message);
      return res.status(500).json({ error: 'Could not retrieve support tickets.' });
    }
  });

  app.get('/api/admin/support/tickets', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    const status = String(req.query.status || '').trim().toLowerCase();
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (status && !TICKET_STATUSES.has(status)) return res.status(400).json({ error: 'Unsupported ticket status filter.' });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'limit must be between 1 and 100.' });

    try {
      const result = await pool.query(
        `SELECT t.id, t.order_id, t.subject, t.message, t.category, t.status, t.priority,
                t.admin_reply, t.created_at, t.updated_at,
                o.country, o.operator, o.phone, o.amount, o.currency, o.charge_cents, o.status AS order_status
         FROM support_tickets t
         LEFT JOIN orders o ON o.order_id = t.order_id
         WHERE ($1 = '' OR t.status = $1)
         ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                  t.created_at ASC
         LIMIT $2`,
        [status, limit]
      );
      return res.json({ tickets: result.rows });
    } catch (error) {
      console.error('Admin support ticket list failed:', error.message);
      return res.status(500).json({ error: 'Could not load support tickets.' });
    }
  });

  app.patch('/api/admin/support/tickets/:ticketId', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    const ticketId = Number(req.params.ticketId);
    if (!Number.isSafeInteger(ticketId) || ticketId < 1) return res.status(400).json({ error: 'Invalid ticket ID.' });

    const body = req.body || {};
    const status = body.status === undefined ? null : String(body.status).trim().toLowerCase();
    const priority = body.priority === undefined ? null : String(body.priority).trim().toLowerCase();
    const hasReply = Object.prototype.hasOwnProperty.call(body, 'adminReply');
    const adminReply = hasReply ? String(body.adminReply ?? '').trim() : null;

    if (status !== null && !TICKET_STATUSES.has(status)) return res.status(400).json({ error: 'Unsupported ticket status.' });
    if (priority !== null && !TICKET_PRIORITIES.has(priority)) return res.status(400).json({ error: 'Unsupported ticket priority.' });
    if (hasReply && adminReply.length > 4000) return res.status(400).json({ error: 'Admin reply must be 4000 characters or fewer.' });
    if (status === null && priority === null && !hasReply) return res.status(400).json({ error: 'Provide status, priority, or adminReply.' });

    try {
      const result = await pool.query(
        `UPDATE support_tickets
         SET status = COALESCE($2, status),
             priority = COALESCE($3, priority),
             admin_reply = CASE WHEN $4::boolean THEN $5 ELSE admin_reply END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, order_id, subject, message, category, status, priority, admin_reply, created_at, updated_at`,
        [ticketId, status, priority, hasReply, adminReply]
      );
      if (result.rowCount !== 1) return res.status(404).json({ error: 'Support ticket not found.' });
      return res.json({ ticket: result.rows[0] });
    } catch (error) {
      console.error('Admin support ticket update failed:', error.message);
      return res.status(500).json({ error: 'Could not update support ticket.' });
    }
  });

  // Approve every eligible catalog mapping for one exact, stable DT One network.
  // This verifies mappings only: customer-facing active flags and retail prices are untouched.
  app.post('/api/admin/countries/:countryCode/operators/:operatorKey/approve-products', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    const countryCode = String(req.params.countryCode || '').trim().toUpperCase();
    const operatorKey = String(req.params.operatorKey || '').trim();
    const sourceProductCatalogId = Number(req.body?.sourceProductCatalogId);
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(operatorKey) ||
        !Number.isSafeInteger(sourceProductCatalogId) || sourceProductCatalogId < 1) {
      return res.status(400).json({ error: 'Valid country, stable operator key, and source product catalog ID are required.' });
    }
    if (req.body?.confirmBulkApproval !== true) {
      return res.status(400).json({ error: 'Explicit bulk approval confirmation is required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const operator = await client.query(
        `SELECT o.country_code, o.operator_key, o.display_name, o.provider_operator_id,
                o.verified_at, c.destination_currency
           FROM country_operators o
           JOIN country_registry c ON c.country_code = o.country_code
          WHERE o.country_code = $1 AND o.operator_key = $2
            AND o.provider = 'dtone' AND c.provider = 'dtone'
          FOR UPDATE OF o`,
        [countryCode, operatorKey]
      );
      if (operator.rowCount !== 1 || !operator.rows[0].provider_operator_id || !operator.rows[0].verified_at) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This exact DT One network has no independently verified provider operator identity.' });
      }
      const rows = await client.query(
        `SELECT cop.id AS mapping_id, cop.country_code, cop.operator_key,
                cop.product_catalog_id, p.product_id AS provider_product_id,
                p.country AS product_country, p.operator, p.currency,
                p.wholesale_price_eur_cents, o.display_name AS operator_name
           FROM country_operator_products cop
           JOIN country_operators o
             ON o.country_code = cop.country_code AND o.operator_key = cop.operator_key
           JOIN product_catalog p ON p.id = cop.product_catalog_id
          WHERE cop.country_code = $1 AND cop.operator_key = $2
          ORDER BY p.amount, p.id
          FOR UPDATE OF cop, p`,
        [countryCode, operatorKey]
      );
      const { selectEligibleNetworkProducts } = require('./network-product-approval');
      const selection = selectEligibleNetworkProducts(rows.rows, {
        countryCode, operatorKey, sourceCatalogId: sourceProductCatalogId,
      });
      if (!selection.eligible.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No eligible DT One products were found for this network.' });
      }

      const batch = await client.query(
        `INSERT INTO country_network_product_approval_batches
           (country_code, operator_key, source_product_catalog_id,
            approved_product_count, blocked_product_count, actor)
         VALUES ($1,$2,$3,$4,$5,'admin-api-key')
         RETURNING id, country_code, operator_key, source_product_catalog_id,
                   approved_product_count, blocked_product_count, created_at`,
        [countryCode, operatorKey, sourceProductCatalogId, selection.eligible.length, selection.blocked.length]
      );
      const batchId = batch.rows[0].id;
      for (const item of selection.eligible) {
        await client.query(
          `UPDATE country_operator_products
              SET verified_at = COALESCE(verified_at, NOW()), updated_at = NOW()
            WHERE id = $1 AND country_code = $2 AND operator_key = $3`,
          [item.mappingId, countryCode, operatorKey]
        );
        await client.query(
          `INSERT INTO country_network_product_approval_items
             (batch_id, country_operator_product_id, product_catalog_id,
              provider_product_id, wholesale_price_eur_cents)
           VALUES ($1,$2,$3,$4,$5)`,
          [batchId, item.mappingId, item.productCatalogId, item.providerProductId, item.wholesalePriceEurCents]
        );
      }
      await client.query('COMMIT');
      return res.status(200).set('Cache-Control', 'no-store').json({
        approved: true,
        batch: batch.rows[0],
        approvedProductCatalogIds: selection.eligible.map(item => item.productCatalogId),
        blockedProducts: selection.blocked,
        customerProductsActivated: false,
        catalogPricesWritten: false,
        checkoutEnabled: false,
        note: 'All eligible products for this exact country/operator mapping were verified. Other networks and countries were not changed.',
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error('Network-wide product approval failed:', error.message);
      return res.status(500).json({ error: 'Could not complete network-wide product approval.' });
    } finally {
      client.release();
    }
  });

};
