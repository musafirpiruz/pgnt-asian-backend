'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminAuthenticator, parseAdminApiKeys } = require('../admin-auth');

const KEY_A = 'a'.repeat(48);
const KEY_B = 'b'.repeat(48);

test('named admin API keys resolve to distinct stable audit identities', () => {
  const auth = createAdminAuthenticator({
    adminApiKeysJson: JSON.stringify({ 'piruz-admin': KEY_A, 'support-admin': KEY_B }),
  });
  assert.equal(auth.configured, true);
  assert.deepEqual(auth.authenticate(KEY_A), {
    configured: true, authenticated: true, actorId: 'piruz-admin',
  });
  assert.deepEqual(auth.authenticate(KEY_B), {
    configured: true, authenticated: true, actorId: 'support-admin',
  });
  assert.equal(auth.authenticate('wrong-key').authenticated, false);
});

test('legacy single admin key requires an explicit stable actor ID', () => {
  const missing = createAdminAuthenticator({ legacyApiKey: KEY_A });
  assert.equal(missing.configured, false);
  assert.match(missing.configurationError, /ADMIN_ACTOR_ID/);
  const configured = createAdminAuthenticator({ legacyApiKey: KEY_A, legacyActorId: 'primary-admin' });
  assert.equal(configured.authenticate(KEY_A).actorId, 'primary-admin');
});

test('malformed or weak multi-admin credentials fail closed', () => {
  assert.throws(() => parseAdminApiKeys('[]'));
  assert.throws(() => parseAdminApiKeys('{bad json'));
  assert.throws(() => parseAdminApiKeys(JSON.stringify({ 'bad id': KEY_A })));
  assert.throws(() => parseAdminApiKeys(JSON.stringify({ admin: 'short' })));
  const invalid = createAdminAuthenticator({ adminApiKeysJson: '{bad json', legacyApiKey: KEY_A, legacyActorId: 'fallback' });
  assert.equal(invalid.configured, false);
  assert.equal(invalid.authenticate(KEY_A).authenticated, false);
});

test('a configured multi-admin key set takes precedence over legacy credentials', () => {
  const auth = createAdminAuthenticator({
    adminApiKeysJson: JSON.stringify({ 'only-admin': KEY_B }),
    legacyApiKey: KEY_A,
    legacyActorId: 'legacy-admin',
  });
  assert.equal(auth.authenticate(KEY_A).authenticated, false);
  assert.equal(auth.authenticate(KEY_B).actorId, 'only-admin');
});
