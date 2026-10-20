// Influencer campaign safety regression tests; source-only, no live payment/provider calls.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'influencer-routes.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('influencer campaigns have a separate migration and preserve legacy referral history', () => {
  assert.match(migration, /013_influencer_campaigns/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS influencer_campaigns/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS influencer_attributions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS influencer_rewards/);
  assert.match(migration, /ALTER TABLE orders ADD COLUMN IF NOT EXISTS influencer_campaign_id/);
  assert.doesNotMatch(migration, /DELETE FROM referral_(codes|ledger|attributions)/);
});

test('campaign creation defaults inactive and supports dates, optional caps and zero reward', () => {
  assert.match(routes, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,FALSE\)/);
  assert.match(routes, /rewardEurCents/);
  assert.match(routes, /startsAt/);
  assert.match(routes, /endsAt/);
  assert.match(routes, /maxConversions/);
});

test('campaign management and reward decisions require admin authentication', () => {
  assert.match(routes, /app\.post\('\/api\/admin\/influencer-campaigns', requireAdmin/);
  assert.match(routes, /app\.patch\('\/api\/admin\/influencer-campaigns\/:id', requireAdmin/);
  assert.match(routes, /app\.post\('\/api\/admin\/influencer-rewards\/:id\/decision', requireAdmin/);
  assert.match(routes, /'approved'/);
  assert.match(routes, /'paid'/);
  assert.match(routes, /'rejected'/);
});

test('checkout attribution is campaign-specific and locked to a single install hash', () => {
  assert.match(server, /influencerCode/);
  assert.match(server, /influencerInstallHash/);
  assert.match(server, /FROM influencer_campaigns WHERE code = \$1 FOR UPDATE/);
  assert.match(migration, /install_hash CHAR\(64\) NOT NULL UNIQUE/);
});

test('only final successful top-up creates a pending influencer reward for first paid attribution', () => {
  assert.match(server, /if \(nextStatus === 'completed' && order\.influencer_campaign_id && order\.influencer_install_hash\)/);
  assert.match(server, /first_paid_order_id IS NULL RETURNING id/);
  assert.match(server, /influencer_rewards .*'pending'/);
  assert.match(server, /ensureReferralRewardRecorded = async/);
});
