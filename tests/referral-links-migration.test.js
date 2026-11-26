'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '027_opaque_referral_links.sql'),
  'utf8',
);

test('opaque referral links store only a unique hash, never the public token', () => {
  assert.match(migration, /link_token_hash CHAR\(64\)/);
  assert.match(migration, /uq_referral_codes_link_token_hash/);
  assert.match(migration, /WHERE link_token_hash IS NOT NULL/);
  assert.doesNotMatch(migration, /link_token\s+TEXT\s*(?:,|\))/i);
});

test('referral links support explicit creation and revocation timestamps', () => {
  assert.match(migration, /link_token_created_at TIMESTAMPTZ/);
  assert.match(migration, /link_token_revoked_at TIMESTAMPTZ/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
});
