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
                e.id AS escalation_id, e.status AS escalation_status,
                e.note AS escalation_note, e.created_at AS escalated_at,
                o.country, o.operator,
                CASE WHEN $3 = 'owner' THEN o.phone ELSE NULL END AS phone,
                o.amount, o.currency,
                CASE WHEN $3 = 'owner' THEN o.charge_cents ELSE NULL END AS charge_cents,
                o.status AS order_status
         FROM support_tickets t
         LEFT JOIN orders o ON o.order_id = t.order_id
         LEFT JOIN LATERAL (
           SELECT id, status, note, created_at
           FROM support_ticket_escalations
           WHERE ticket_id = t.id
           ORDER BY created_at DESC, id DESC
           LIMIT 1
         ) e ON TRUE
         WHERE ($1 = '' OR t.status = $1)
         ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                  t.created_at ASC
         LIMIT $2`,
        [status, limit, req.admin?.role || 'legacy']
      );
      return res.json({ tickets: result.rows });
    } catch (error) {
      console.error('Admin support ticket list failed:', error.message);
      return res.status(500).json({ error: 'Could not load support tickets.' });
    }
  });

  // A separate, permission-gated handoff. The owner inbox reads the pending
  // escalation from the admin ticket list; normal replies cannot create one.
  app.post('/api/admin/support/tickets/:ticketId/escalate', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    const ticketId = Number(req.params.ticketId);
    if (!Number.isSafeInteger(ticketId) || ticketId < 1) {
      return res.status(400).json({ error: 'Invalid ticket ID.' });
    }
    const note = String(req.body?.note || '').trim();
    if (note.length > 1000) {
      return res.status(400).json({ error: 'Escalation note must be 1000 characters or fewer.' });
    }
    const adminUid = String(req.admin?.uid || '').trim();
    if (!adminUid) return res.status(401).json({ error: 'Verified administrator identity is required.' });

    try {
      const result = await pool.query(
        `INSERT INTO support_ticket_escalations (ticket_id, escalated_by_uid, note)
         SELECT id, $2, $3 FROM support_tickets WHERE id = $1
         ON CONFLICT (ticket_id) WHERE status = 'pending'
         DO UPDATE SET note = EXCLUDED.note
         RETURNING id, ticket_id, status, note, created_at`,
        [ticketId, adminUid, note]
      );
      if (result.rowCount !== 1) return res.status(404).json({ error: 'Support ticket not found.' });
      await pool.query(
        "UPDATE support_tickets SET priority = 'urgent', updated_at = NOW() WHERE id = $1",
        [ticketId]
      );
      return res.status(201).json({ escalation: result.rows[0] });
    } catch (error) {
      console.error('Support ticket escalation failed:', error.message);
      return res.status(500).json({ error: 'Could not escalate support ticket.' });
    }
  });

  // Owner-only lifecycle controls for the escalation inbox. The RBAC mapper
  // intentionally leaves these POST routes at owner.only.
  app.post('/api/admin/support/escalations/:escalationId/acknowledge', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    if (req.admin?.role !== 'owner') return res.status(403).json({ error: 'Owner access is required.' });
    const escalationId = Number(req.params.escalationId);
    const adminUid = String(req.admin?.uid || '').trim();
    if (!Number.isSafeInteger(escalationId) || escalationId < 1) return res.status(400).json({ error: 'Invalid escalation ID.' });
    if (!adminUid) return res.status(401).json({ error: 'Verified administrator identity is required.' });
    try {
      const result = await pool.query(
        `UPDATE support_ticket_escalations
         SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by_uid = $2
         WHERE id = $1 AND status = 'pending'
         RETURNING id, ticket_id, status, note, created_at, acknowledged_at, acknowledged_by_uid`,
        [escalationId, adminUid]
      );
      if (result.rowCount !== 1) return res.status(409).json({ error: 'Escalation is not pending or does not exist.' });
      return res.json({ escalation: result.rows[0] });
    } catch (error) {
      console.error('Support escalation acknowledgement failed:', error.message);
      return res.status(500).json({ error: 'Could not acknowledge support escalation.' });
    }
  });

  app.post('/api/admin/support/escalations/:escalationId/resolve', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    if (req.admin?.role !== 'owner') return res.status(403).json({ error: 'Owner access is required.' });
    const escalationId = Number(req.params.escalationId);
    const adminUid = String(req.admin?.uid || '').trim();
    if (!Number.isSafeInteger(escalationId) || escalationId < 1) return res.status(400).json({ error: 'Invalid escalation ID.' });
    if (!adminUid) return res.status(401).json({ error: 'Verified administrator identity is required.' });
    try {
      const result = await pool.query(
        `UPDATE support_ticket_escalations
         SET status = 'resolved', acknowledged_at = COALESCE(acknowledged_at, NOW()),
             acknowledged_by_uid = COALESCE(acknowledged_by_uid, $2),
             resolved_at = NOW(), resolved_by_uid = $2
         WHERE id = $1 AND status IN ('pending', 'acknowledged')
         RETURNING id, ticket_id, status, note, created_at, acknowledged_at, acknowledged_by_uid,
                   resolved_at, resolved_by_uid`,
        [escalationId, adminUid]
      );
      if (result.rowCount !== 1) return res.status(409).json({ error: 'Escalation is already resolved or does not exist.' });
      return res.json({ escalation: result.rows[0] });
    } catch (error) {
      console.error('Support escalation resolution failed:', error.message);
      return res.status(500).json({ error: 'Could not resolve support escalation.' });
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
    if (req.admin?.role === 'support' && (!hasReply || status !== null || priority !== null)) {
      return res.status(403).json({ error: 'Support administrators may only send customer replies; use the separate escalation action for Owner review.' });
    }
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
};
