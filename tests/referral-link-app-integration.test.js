'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migrations = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const phoneAuth = fs.readFileSync(path.join(__dirname, '..', 'phone-auth.js'), 'utf8');

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

test('legacy referral records without a live opaque token cannot be activated', () => {
  const reportStart = server.indexOf("app.get('/api/admin/referrals'");
  const updateStart = server.indexOf("app.patch('/api/admin/referrals/codes/:code'");
  const deleteStart = server.indexOf("app.delete('/api/admin/referrals/codes/:code'");
  const report = server.slice(reportStart, updateStart);
  const update = server.slice(updateStart, deleteStart);
  assert.match(report, /has_invite_link/);
  assert.ok(report.includes('link_token_hash IS NOT NULL'));
  assert.ok(report.includes('link_token_revoked_at IS NULL'));
  assert.match(update, /Only a valid, non-revoked invite link can be activated/);
  assert.match(update, /link_token_hash/);
  assert.match(update, /link_token_revoked_at/);
});

test('admin report disables activation controls for legacy records without invite tokens', () => {
  const pageStart = server.indexOf("app.get('/admin-dtone-check'");
  const controlStart = server.indexOf("const toggle=makeTicketElement('button',ref.active?", pageStart);
  const controlEnd = server.indexOf("const remove=makeTicketElement('button'", controlStart);
  assert.ok(pageStart >= 0 && controlStart > pageStart && controlEnd > controlStart);
  const controls = server.slice(controlStart, controlEnd);
  assert.match(controls, /ref\.has_invite_link/);
  assert.match(controls, /Legacy code — no invite link/);
  assert.match(controls, /toggle\.disabled=true/);
  assert.match(controls, /api\/admin\/referrals\/links\//);
});
test('Android APK workflow registers the app invite URI scheme and runs on this feature branch', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build-apk.yml'), 'utf8');
  assert.match(workflow, /feature\/referral-links-no-manual-codes/);
  assert.match(workflow, /Register the private referral invite URI scheme/);
  assert.match(workflow, /android\.intent\.action\.VIEW/);
  assert.match(workflow, /pgntasian/);
  assert.match(workflow, /referral/);
});

test('referral invite creation validates the owner contact length server-side', () => {
  const start = server.indexOf("app.post('/api/admin/referrals/links'");
  const end = server.indexOf("app.post('/api/admin/referrals/links/:code/revoke'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /ownerContact && ownerContact\.length > 254/);
  assert.match(route, /ownerContact must be 254 characters or fewer/);
});

test('Firebase UID referral migration preserves legacy hashes and adds unique verified-identity keys', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '028_firebase_uid_referral_identity.sql'), 'utf8');
  assert.ok(migrations.includes('version: "028_firebase_uid_referral_identity", file: "028_firebase_uid_referral_identity.sql"'));
  assert.match(migration, /ALTER COLUMN install_id_hash DROP NOT NULL/);
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)"));
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS referral_firebase_uid VARCHAR(128)"));
  assert.match(migration, /uq_referral_attributions_firebase_uid/);
  assert.match(migration, /uq_referral_ledger_firebase_uid/);
  assert.match(migration, /WHERE firebase_uid IS NOT NULL/);
  assert.match(migration, /VALIDATE CONSTRAINT referral_attributions_identity_required/);
  assert.match(migration, /VALIDATE CONSTRAINT referral_ledger_identity_required/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/);
});

test('Firebase UID schema foundation does not activate referral checkout or phone SMS', () => {
  const checkoutStart = server.indexOf("app.post('/api/payments/checkout'");
  const checkoutEnd = server.indexOf('// Dedicated Stripe + DT One end-to-end test.', checkoutStart);
  const checkout = server.slice(checkoutStart, checkoutEnd);
  assert.match(checkout, /REFERRAL_IDENTITY_VERIFICATION_REQUIRED/);
  assert.match(checkout, /optionalCheckoutFirebaseAuth/);
  assert.match(checkout, /req\.auth\?\.uid/);
  assert.match(checkout, /referral_firebase_uid/);
  assert.match(checkout, /WHERE ra\.firebase_uid = \$1/);
  assert.doesNotMatch(checkout, /referralInstallId|referralInstallHash|install_id_hash/);
  assert.match(checkout, /Rewards remain disabled/);
  assert.match(server, /registerPhoneAuthRoutes/);
  assert.match(phoneAuth, /app\.post\('\/api\/auth\/phone\/send', deferred\)/);
  assert.match(phoneAuth, /app\.post\('\/api\/auth\/phone\/verify', deferred\)/);
});
