'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAdminRbac,
  SUPPORT_PERMISSIONS,
  permissionForAdminRequest,
} = require('../admin-rbac');

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function authenticate(rbac, uid) {
  const req = { auth: { uid } };
  const res = responseRecorder();
  let nextCalled = false;
  await rbac.authenticateAdmin(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test('Support role has only the intended support permissions', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: async (req, res, next) => next(),
    ownerUid: 'owner-firebase-uid',
    supportUid: 'support-firebase-uid',
  });
  const result = await authenticate(rbac, 'support-firebase-uid');
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.admin.role, 'support');
  assert.equal(result.req.admin.uid, 'support-firebase-uid');
  assert.deepEqual(result.req.admin.permissions, SUPPORT_PERMISSIONS);
  assert.equal(Object.isFrozen(result.req.admin), true);
});

test('Owner role is assigned only to the configured Owner Firebase UID', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: async (req, res, next) => next(),
    ownerUid: 'owner-firebase-uid',
    supportUid: 'support-firebase-uid',
  });
  const result = await authenticate(rbac, 'owner-firebase-uid');
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.admin.role, 'owner');
  assert.deepEqual(result.req.admin.permissions, ['*']);
});

test('unknown Firebase identities are rejected', async () => {
  const rbac = createAdminRbac({
    firebaseAuthMiddleware: async (req, res, next) => next(),
    ownerUid: 'owner-firebase-uid',
    supportUid: 'support-firebase-uid',
  });
  const result = await authenticate(rbac, 'unlisted-firebase-uid');
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.code, 'ADMIN_IDENTITY_NOT_ALLOWED');
});

test('RBAC fails closed unless two distinct administrator UIDs are configured', async () => {
  for (const [config, rolloutRequested] of [
    [{}, false],
    [{ ownerUid: 'same-uid', supportUid: 'same-uid' }, true],
    [{ ownerUid: 'owner-only', supportUid: '' }, true],
    [{ ownerUid: '', supportUid: 'support-only' }, true],
  ]) {
    const rbac = createAdminRbac({
      firebaseAuthMiddleware: async (req, res, next) => next(),
      ...config,
    });
    assert.equal(rbac.configured, false);
    assert.equal(rbac.rolloutRequested, rolloutRequested);
    const result = await authenticate(rbac, 'same-uid');
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 503);
    assert.equal(result.res.body.code, 'ADMIN_RBAC_NOT_CONFIGURED');
  }
});

test('Support can read its session, read/reply to tickets and escalate to Owner', () => {
  const routes = [
    [{ method: 'GET', path: '/api/admin/session' }, 'support.orders.read_limited'],
    [{ method: 'GET', path: '/api/admin/support/tickets' }, 'support.tickets.read'],
    [{ method: 'PATCH', path: '/api/admin/support/tickets/42' }, 'support.tickets.reply'],
    [{ method: 'POST', path: '/api/admin/support/tickets/42/escalate' }, 'support.tickets.escalate'],
  ];
  for (const [request, expected] of routes) {
    assert.equal(permissionForAdminRequest(request), expected);
    const middleware = createAdminRbac({
      firebaseAuthMiddleware: async (req, res, next) => next(),
      ownerUid: 'owner',
      supportUid: 'support',
    }).requireAdminPermission(expected);
    const req = { admin: { uid: 'support', role: 'support', permissions: SUPPORT_PERMISSIONS } };
    const res = responseRecorder();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, request.method + ' ' + request.path);
  }
});

test('Support is denied Owner-only catalog, payment and escalation lifecycle routes', () => {
  const routes = [
    { method: 'POST', path: '/api/admin/country-operators/1/approve-sample' },
    { method: 'POST', path: '/api/admin/support/escalations/7/acknowledge' },
    { method: 'POST', path: '/api/admin/support/escalations/7/resolve' },
    { method: 'GET', path: '/api/admin/wallets/diagnostics' },
  ];
  const middleware = createAdminRbac({
    firebaseAuthMiddleware: async (req, res, next) => next(),
    ownerUid: 'owner',
    supportUid: 'support',
  }).requireAdminPermission('owner.only');

  for (const request of routes) {
    assert.equal(permissionForAdminRequest(request), 'owner.only');
    const req = {
      ...request,
      admin: { uid: 'support', role: 'support', permissions: SUPPORT_PERMISSIONS },
    };
    const res = responseRecorder();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ADMIN_PERMISSION_DENIED');
  }
});

test('Owner can pass every named permission', () => {
  const middleware = createAdminRbac({
    firebaseAuthMiddleware: async (req, res, next) => next(),
    ownerUid: 'owner',
    supportUid: 'support',
  }).requireAdminPermission('owner.only');
  const req = { admin: { uid: 'owner', role: 'owner', permissions: ['*'] } };
  const res = responseRecorder();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});


test('audit actor attribution records verified Firebase UIDs and labels the legacy shared key', () => {
  const { adminAuditActorFor } = require('../admin-rbac');
  assert.deepEqual(adminAuditActorFor({ uid: 'owner-firebase-uid', role: 'owner' }), {
    type: 'admin_user', id: 'owner-firebase-uid',
  });
  assert.deepEqual(adminAuditActorFor({ uid: 'support-firebase-uid', role: 'support' }), {
    type: 'admin_user', id: 'support-firebase-uid',
  });
  assert.deepEqual(adminAuditActorFor({ uid: 'legacy-admin-key', role: 'owner' }), {
    type: 'admin_api_key', id: 'shared_admin_api_key',
  });
  assert.deepEqual(adminAuditActorFor(null), {
    type: 'admin_api_key', id: 'shared_admin_api_key',
  });
});


test('partial Firebase administrator rollout is distinguishable from legacy mode', () => {
  const legacy = createAdminRbac({ firebaseAuthMiddleware: async (_req, _res, next) => next() });
  const partialOwner = createAdminRbac({
    firebaseAuthMiddleware: async (_req, _res, next) => next(), ownerUid: 'owner-only',
  });
  const partialSupport = createAdminRbac({
    firebaseAuthMiddleware: async (_req, _res, next) => next(), supportUid: 'support-only',
  });
  assert.equal(legacy.rolloutRequested, false);
  assert.equal(partialOwner.rolloutRequested, true);
  assert.equal(partialSupport.rolloutRequested, true);
  assert.equal(partialOwner.configured, false);
  assert.equal(partialSupport.configured, false);
});
