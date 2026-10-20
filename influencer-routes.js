'use strict';

const crypto = require('crypto');

function hash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

module.exports = function registerInfluencerRoutes({ app, pool, requireAdmin, appBaseUrl }) {
  const unavailable = (res) => res.status(503).json({ error: 'Database is not configured.' });

  app.post('/api/admin/influencer-campaigns', requireAdmin, async (req, res) => {
    if (!pool) return unavailable(res);
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const code = String(b.code || '').trim().toUpperCase();
    const startsAt = new Date(b.startsAt);
    const endsAt = new Date(b.endsAt);
    const rewardCents = b.rewardEurCents === undefined ? 0 : Number(b.rewardEurCents);
    const maxConversions = b.maxConversions === undefined || b.maxConversions === null || b.maxConversions === '' ? null : Number(b.maxConversions);
    if (!name || name.length > 120) return res.status(400).json({ error: 'name must be 1-120 characters.' });
    if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return res.status(400).json({ error: 'code must be 4-40 letters, numbers, _ or -.' });
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return res.status(400).json({ error: 'Valid startsAt and endsAt are required; endsAt must be later.' });
    if (!Number.isSafeInteger(rewardCents) || rewardCents < 0 || rewardCents > 100000) return res.status(400).json({ error: 'rewardEurCents must be 0-100000.' });
    if (maxConversions !== null && (!Number.isSafeInteger(maxConversions) || maxConversions < 0)) return res.status(400).json({ error: 'maxConversions must be a non-negative integer.' });
    try {
      const result = await pool.query(
        `INSERT INTO influencer_campaigns (name, code, starts_at, ends_at, reward_eur_cents, max_conversions, active)
         VALUES ($1,$2,$3,$4,$5,$6,FALSE)
         RETURNING id, name, code, starts_at, ends_at, reward_eur_cents, max_conversions, active, created_at`,
        [name, code, startsAt.toISOString(), endsAt.toISOString(), rewardCents, maxConversions]
      );
      const campaign = result.rows[0];
      return res.status(201).json({ campaign, activationRequired: true, trackingUrl: appBaseUrl + '/api/influencer-campaigns/click/' + encodeURIComponent(code) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Campaign code already exists.' });
      console.error('Influencer campaign create failed:', e.message);
      return res.status(500).json({ error: 'Could not create campaign.' });
    }
  });

  app.get('/api/admin/influencer-campaigns', requireAdmin, async (req, res) => {
    if (!pool) return unavailable(res);
    try {
      const result = await pool.query(
        `SELECT c.*, COUNT(DISTINCT a.id)::int AS attributed_installs,
           COUNT(DISTINCT a.customer_key)::int AS attributed_customers,
           COUNT(DISTINCT a.first_paid_order_id)::int AS successful_first_topups,
           COUNT(DISTINCT r.id)::int AS reward_entries
         FROM influencer_campaigns c
         LEFT JOIN influencer_attributions a ON a.campaign_id = c.id
         LEFT JOIN influencer_rewards r ON r.campaign_id = c.id
         GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`
      );
      return res.json({ campaigns: result.rows });
    } catch (e) {
      console.error('Influencer campaign list failed:', e.message);
      return res.status(500).json({ error: 'Could not list campaigns.' });
    }
  });

  app.patch('/api/admin/influencer-campaigns/:id', requireAdmin, async (req, res) => {
    if (!pool) return unavailable(res);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid campaign id.' });
    const b = req.body || {};
    const allowed = ['active', 'name', 'startsAt', 'endsAt', 'rewardEurCents', 'maxConversions'];
    if (!allowed.some(k => Object.prototype.hasOwnProperty.call(b, k))) return res.status(400).json({ error: 'No supported campaign fields supplied.' });
    if (b.active !== undefined && typeof b.active !== 'boolean') return res.status(400).json({ error: 'active must be boolean.' });
    if (b.rewardEurCents !== undefined && (!Number.isSafeInteger(Number(b.rewardEurCents)) || Number(b.rewardEurCents) < 0 || Number(b.rewardEurCents) > 100000)) return res.status(400).json({ error: 'rewardEurCents must be 0-100000.' });
    if (b.maxConversions !== undefined && b.maxConversions !== null && (!Number.isSafeInteger(Number(b.maxConversions)) || Number(b.maxConversions) < 0)) return res.status(400).json({ error: 'maxConversions must be null or a non-negative integer.' });
    const startsAt = b.startsAt === undefined ? null : new Date(b.startsAt);
    const endsAt = b.endsAt === undefined ? null : new Date(b.endsAt);
    if ((startsAt && !Number.isFinite(startsAt.getTime())) || (endsAt && !Number.isFinite(endsAt.getTime()))) return res.status(400).json({ error: 'Invalid campaign date.' });
    if (b.name !== undefined && (!String(b.name).trim() || String(b.name).trim().length > 120)) return res.status(400).json({ error: 'name must be 1-120 characters.' });
    try {
      // Validate the combined date range before UPDATE so a bad request returns 400
      // instead of hitting the database CHECK constraint and becoming a 500.
      const existing = await pool.query('SELECT starts_at, ends_at FROM influencer_campaigns WHERE id=$1', [id]);
      if (!existing.rowCount) return res.status(404).json({ error: 'Campaign not found.' });
      const finalStart = startsAt || new Date(existing.rows[0].starts_at);
      const finalEnd = endsAt || new Date(existing.rows[0].ends_at);
      if (finalEnd <= finalStart) return res.status(400).json({ error: 'Campaign end must be after start.' });
      const r = await pool.query(
        `UPDATE influencer_campaigns SET
          active = COALESCE($2, active), name = COALESCE($3, name),
          starts_at = COALESCE($4, starts_at), ends_at = COALESCE($5, ends_at),
          reward_eur_cents = COALESCE($6, reward_eur_cents),
          max_conversions = CASE WHEN $7::boolean THEN $8::integer ELSE max_conversions END,
          updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, b.active ?? null, b.name === undefined ? null : String(b.name).trim(),
          startsAt ? startsAt.toISOString() : null, endsAt ? endsAt.toISOString() : null,
          b.rewardEurCents === undefined ? null : Number(b.rewardEurCents),
          Object.prototype.hasOwnProperty.call(b, 'maxConversions'), b.maxConversions === undefined || b.maxConversions === null ? null : Number(b.maxConversions)]
      );
      if (!r.rowCount) return res.status(404).json({ error: 'Campaign not found.' });
      return res.json({ campaign: r.rows[0] });
    } catch (e) {
      console.error('Influencer campaign update failed:', e.message);
      return res.status(500).json({ error: 'Could not update campaign.' });
    }
  });

  app.get('/api/admin/influencer-campaigns/:id/report', requireAdmin, async (req, res) => {
    if (!pool) return unavailable(res);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid campaign id.' });
    try {
      const [campaign, clicks, attributions, rewards] = await Promise.all([
        pool.query('SELECT * FROM influencer_campaigns WHERE id=$1', [id]),
        pool.query('SELECT COUNT(*)::int AS clicks, COUNT(DISTINCT visitor_hash)::int AS unique_visitors FROM influencer_clicks WHERE campaign_id=$1', [id]),
        pool.query(`SELECT COUNT(*)::int AS attributed_installs, COUNT(DISTINCT customer_key)::int AS signups,
          COUNT(first_paid_order_id)::int AS first_paid_topups FROM influencer_attributions WHERE campaign_id=$1`, [id]),
        pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(reward_eur_cents),0)::int AS total_cents
          FROM influencer_rewards WHERE campaign_id=$1 GROUP BY status`, [id])
      ]);
      if (!campaign.rowCount) return res.status(404).json({ error: 'Campaign not found.' });
      return res.json({ campaign: campaign.rows[0], clicks: clicks.rows[0], attribution: attributions.rows[0], rewards: rewards.rows });
    } catch (e) {
      console.error('Influencer report failed:', e.message);
      return res.status(500).json({ error: 'Could not generate campaign report.' });
    }
  });

  app.get('/api/admin/influencer-rewards', requireAdmin, async (req, res) => {
    if (!pool) return unavailable(res);
    try {
      const r = await pool.query(`SELECT r.*, c.code, c.name AS campaign_name FROM influencer_rewards r
        JOIN influencer_campaigns c ON c.id=r.campaign_id ORDER BY r.created_at DESC LIMIT 300`);
      return res.json({ rewards: r.rows });
    } catch (e) {
      console.error('Influencer rewards list failed:', e.message);
      return res.status(500).json({ error: 'Could not list rewards.' });
    }
  });

  app.post('/api/admin/influencer-rewards/:id/decision', requireAdmin, async (req, res) => {
    if (!pool) return unavailable(res);
    const id = Number(req.params.id);
    const action = String(req.body?.action || '');
    if (!Number.isSafeInteger(id) || id <= 0 || !['approve', 'pay', 'reject'].includes(action)) return res.status(400).json({ error: 'Use a valid reward id and action: approve, pay, or reject.' });
    const next = { approve: 'approved', pay: 'paid', reject: 'rejected' }[action];
    try {
      const r = await pool.query(
        `UPDATE influencer_rewards SET status=$2, updated_at=NOW()
         WHERE id=$1 AND (($2='approved' AND status='pending') OR ($2='paid' AND status='approved') OR ($2='rejected' AND status IN ('pending','approved')))
         RETURNING *`, [id, next]
      );
      if (!r.rowCount) return res.status(409).json({ error: 'Reward not found or invalid status transition.' });
      return res.json({ reward: r.rows[0] });
    } catch (e) {
      console.error('Influencer reward decision failed:', e.message);
      return res.status(500).json({ error: 'Could not update reward.' });
    }
  });

  app.get('/api/influencer-campaigns/click/:code', async (req, res) => {
    if (!pool) return unavailable(res);
    const code = String(req.params.code || '').trim().toUpperCase();
    const visitorId = String(req.query.visitorId || '').trim();
    if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return res.status(400).json({ error: 'Invalid campaign code.' });
    // The public URL works without app query parameters. A client-supplied stable ID is preferred;
    // otherwise use a short-lived request fingerprint as lightweight abuse friction, not identity proof.
    const visitorFingerprint = visitorId && /^[A-Za-z0-9._:-]{16,128}$/.test(visitorId)
      ? visitorId
      : String(req.ip || 'unknown') + '|' + String(req.headers['user-agent'] || 'unknown').slice(0, 180);
    try {
      const c = await pool.query(`SELECT id, code, active, starts_at, ends_at FROM influencer_campaigns WHERE code=$1`, [code]);
      if (!c.rowCount || !c.rows[0].active || new Date(c.rows[0].starts_at) > new Date() || new Date(c.rows[0].ends_at) <= new Date()) return res.status(404).json({ error: 'Campaign is not active.' });
      await pool.query(`INSERT INTO influencer_clicks (campaign_id, visitor_hash, created_at)
        VALUES ($1,$2,NOW()) ON CONFLICT (campaign_id, visitor_hash) DO NOTHING`,
        [c.rows[0].id, hash(visitorFingerprint)]);
      return res.json({ valid: true, code, campaignId: c.rows[0].id, message: 'Campaign recorded. Complete sign-up and first successful top-up to qualify for any reward.' });
    } catch (e) {
      console.error('Influencer click tracking failed:', e.message);
      return res.status(500).json({ error: 'Could not record campaign click.' });
    }
  });
};

module.exports.hashInfluencerIdentifier = hash;
