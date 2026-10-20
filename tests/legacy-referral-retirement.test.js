// Regression checks for retiring ordinary-customer referral rewards.
// These checks are source-only and never call Stripe, DT One, or a database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('legacy ordinary referral-code creation is retired', () => {
  const start = server.indexOf("app.post('/api/admin/referrals/codes'");
  const end = server.indexOf("app.get('/api/admin/referrals'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /status\(410\)/);
  assert.match(route, /Ordinary-customer referral rewards are retired/);
});

test('public legacy referral validation is retired', () => {
  const start = server.indexOf("app.get('/api/referrals/validate/:code'");
  const end = server.indexOf('// Small browser page for the owner', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /status\(410\)/);
  assert.match(route, /Ordinary-customer referral codes are retired/);
});

test('completed top-up callback no longer grants ordinary referral rewards', () => {
  const start = server.indexOf('const ensureReferralRewardRecorded = async');
  const end = server.indexOf('// DT One may retry a callback', start);
  assert.ok(start >= 0 && end > start);
  const helper = server.slice(start, end);
  assert.match(helper, /Retired ordinary-customer referral program/);
  assert.match(helper, /return false/);
});

test('retirement migration disables old codes and clears legacy bonus without deleting history', () => {
  assert.match(migration, /012_retire_ordinary_referral_rewards/);
  assert.match(migration, /UPDATE referral_codes\s+SET active = FALSE/);
  assert.match(migration, /SET bonus_percent = 0/);
  assert.doesNotMatch(migration, /DELETE FROM referral_(codes|ledger|attributions)/);
});

test('new legacy retirement migration uses a transaction and is idempotent', () => {
  assert.match(migration, /retireLegacyReferralCheck/);
  assert.match(migration, /BEGIN[\s\S]*?012_retire_ordinary_referral_rewards[\s\S]*?COMMIT/);
  assert.match(migration, /ON CONFLICT \(version\) DO NOTHING/);
});
