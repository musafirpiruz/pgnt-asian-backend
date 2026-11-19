'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const support = fs.readFileSync(path.join(__dirname, '..', 'support-routes.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '026_support_ticket_escalation_inbox.sql'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'admin-panel.html'), 'utf8');

test('support escalation is a dedicated authenticated endpoint', () => {
  assert.match(support, /app\.post\(['"]\/api\/admin\/support\/tickets\/:ticketId\/escalate['"], requireAdmin/);
  assert.match(support, /req\.admin\?\.uid/);
  assert.match(support, /support_ticket_escalations/);
});

test('pending escalations are unique per ticket and auditable', () => {
  assert.match(migration, /escalated_by_uid TEXT NOT NULL/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration, /uq_support_ticket_one_pending_escalation/);
});

test('owner ticket inbox can read the latest escalation state', () => {
  assert.match(support, /e\.status AS escalation_status/);
  assert.match(support, /LEFT JOIN LATERAL/);
});

test('admin panel uses the dedicated escalation endpoint, not ticket PATCH', () => {
  assert.match(panel, /\/escalate/);
  assert.match(panel, /adminRole==='support'/);
  assert.match(panel, /Owner بیاکتنه/);
});

test('owner escalation lifecycle endpoints require the owner role and verified UID', () => {
  assert.match(support, /api\/admin\/support\/escalations\/:escalationId\/acknowledge/);
  assert.match(support, /api\/admin\/support\/escalations\/:escalationId\/resolve/);
  assert.equal((support.match(/req\.admin\?\.role !== 'owner'/g) || []).length, 2);
  assert.match(support, /acknowledged_by_uid = \$2/);
  assert.match(support, /status = 'resolved'/);
  assert.match(support, /resolved_at = NOW\(\), resolved_by_uid = \$2/);
  assert.match(support, /resolved_at TIMESTAMPTZ/);
  assert.match(migration, /resolved_by_uid TEXT/);
});

test('owner inbox exposes acknowledge and resolve actions', () => {
  assert.match(panel, /د سپارل شوې موضوع منل/);
  assert.match(panel, /موضوع حل شوې وټاکه/);
  assert.match(panel, /\/acknowledge/);
  assert.match(panel, /\/resolve/);
});
