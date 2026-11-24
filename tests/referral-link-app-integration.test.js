'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migrations = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('Flutter invite handler accepts opaque link tokens and stores them securely', () => {
  const start = app.indexOf('Future<void> _applyReferralUri(Uri uri)');
  const end = app.indexOf('Future<void> _restoreLocalData()', start);
  assert.ok(start >= 0 && end > start);
  const handler = app.slice(start, end);
  assert.match(handler, /uri\.scheme\.toLowerCase\(\) != 'pgntasian'/);
  assert.match(handler, /uri\.host\.toLowerCase\(\) != 'referral'/);
  assert.match(handler, /queryParameters\['token'\]/);
  assert.match(handler, /_secureStorage\.write/);
  assert.doesNotMatch(handler, /queryParameters\[['"]code['"]\]/);
  assert.doesNotMatch(handler, /referralCode/);
});

test('customer app no longer offers manual referral code entry', () => {
  assert.match(app, /Widget buildReferralCodeField\(\)[\s\S]*?SizedBox\.shrink\(\)/);
  assert.doesNotMatch(app, /TextEditingController referralCodeController/);
});

test('referral link admin API returns a one-time opaque link but never the internal code', () => {
  const start = server.indexOf("app.post('/api/admin/referrals/links'");
  const end = server.indexOf("app.post('/api/admin/referrals/links/:code/revoke'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /crypto\.randomBytes\(32\)/);
  assert.match(route, /createHash\('sha256'\)/);
  assert.match(route, /link_token_hash/);
  assert.match(route, /inviteLink: publicUrl/);
  assert.doesNotMatch(route, /returning\s+code/i);
  assert.match(route, /VALUES \(\$1,\$2,\$3,7,\$4,FALSE,\$5,NOW\(\)\)/);
});

test('opaque referral migration is registered in the existing migration runner', () => {
  assert.match(migrations, /version: "027_opaque_referral_links", file: "027_opaque_referral_links\.sql"/);
});
