'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminRbac, SUPPORT_PERMISSIONS } = require('../admin-rbac');

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function verifiedAuth(uid) {
  return async (req, _res, next) => {
    req.auth = Object.freeze({ uid });
    return next();
  };
}

async function authenticate(rbac, uid) {
  const req = {};
  const res = responseRecorder();
  let nextCalled = false;
  await rbac.authenticateAdmin(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test('fails closed until both distinct administrator Firebase UIDs are configured', async () => {
  for (const config of [
    {},
    { firebaseAuthMiddleware: verifiedAuth('owner'), ownerUid: 'owner' },
    { firebaseAuthMiddleware: verifiedAuth('owner'), ownerUid: 'same', supportUid: 'same' },
  ]) {
    const rbac = createAdminRbac(config);
    const result = await authenticate(rbac, 'owner');
    assert.equal(rbac.configured, false);
    assert.equal(result.res.statusCode, 503);
    assert.equal(result.res.body.code, 'ADMIN_RBAC_NOT_CONFIGURED');
    assert.equal(result.nextCalled, false);
  }
});

test('assigns full owner role only to the configured verified Firebase UID', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: verifiedAuth('owner-uid'),
    ownerUid: 'owner-uid',
    supportUid: 'support-uid',
  });
  const result = await authenticate(rbac, 'owner-uid');
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.req.admin, {
    uid: 'owner-uid',
    role: 'owner',
    permissions: ['*'],
  });
  assert.equal(Object.isFrozen(result.req.admin), true);
});

test('assigns the second administrator support permissions only', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: verifiedAuth('support-uid'),
    ownerUid: 'owner-uid',
    supportUid: 'support-uid',
  });
  const result = await authenticate(rbac, 'support-uid');
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.admin.role, 'support');
  assert.deepEqual(result.req.admin.permissions, SUPPORT_PERMISSIONS);
  assert.equal(result.req.admin.permissions.includes('*'), false);
  assert.equal(result.req.admin.permissions.includes('catalog.sample.approve'), false);
  assert.equal(result.req.admin.permissions.includes('finance.pricing.write'), false);
  assert.equal(result.req.admin.permissions.includes('payments.refund'), false);
});

test('denies any Firebase identity other than the two configured administrator UIDs', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: verifiedAuth('intruder-uid'),
    ownerUid: 'owner-uid',
    supportUid: 'support-uid',
  });
  const result = await authenticate(rbac, 'intruder-uid');
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.code, 'ADMIN_IDENTITY_NOT_ALLOWED');
  assert.equal(result.nextCalled, false);
});

test('permission middleware allows Owner and only named support permissions', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: verifiedAuth('support-uid'),
    ownerUid: 'owner-uid',
    supportUid: 'support-uid',
  });
  const allowSupport = rbac.requireAdminPermission('support.orders.read_limited');
  const denyCatalog = rbac.requireAdminPermission('catalog.sample.approve');
  const support = { admin: { uid: 'support-uid', role: 'support', permissions: SUPPORT_PERMISSIONS } };
  const owner = { admin: { uid: 'owner-uid', role: 'owner', permissions: ['*'] } };
  const missing = {};
  let supportAllowed = false;
  let catalogAllowed = false;
  let ownerAllowed = false;
  const denied = responseRecorder();
  allowSupport(support, responseRecorder(), () => { supportAllowed = true; });
  denyCatalog(support, denied, () => { catalogAllowed = true; });
  allowSupport(owner, responseRecorder(), () => { ownerAllowed = true; });
  assert.equal(supportAllowed, true);
  assert.equal(catalogAllowed, false);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.code, 'ADMIN_PERMISSION_DENIED');
  assert.equal(ownerAllowed, true);
  const unauth = responseRecorder();
  allowSupport(missing, unauth, () => assert.fail('unauthenticated request must not pass'));
  assert.equal(unauth.statusCode, 401);
});

test('rejects empty permission names at configuration time', () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: verifiedAuth('owner-uid'),
    ownerUid: 'owner-uid',
    supportUid: 'support-uid',
  });
  assert.throws(() => rbac.requireAdminPermission(' '), /named administrator permission/);
});
