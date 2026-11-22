'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createFirebaseAuthMiddleware } = require('../firebase-auth');
const { createAdminRbac } = require('../admin-rbac');

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || 'demo-pgnt-asian-topup';

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function createEmulatorUser(host, suffix) {
  const response = await fetch(
    `${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `pgnt-emulator-${suffix}-${Date.now()}@example.test`,
        password: 'EmulatorOnly-Password-123!',
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  assert.equal(typeof body.idToken, 'string');
  assert.equal(typeof body.localId, 'string');
  return body;
}

function makeRequest(token, body = {}) {
  return {
    headers: { authorization: `Bearer ${token}` },
    body,
    method: 'GET',
    path: '/api/admin/session',
  };
}

test('Firebase Auth Emulator ID token is verified and identity cannot be overridden', {
  skip: !emulatorHost && 'Set FIREBASE_AUTH_EMULATOR_HOST to run this integration test.',
}, async () => {
  const host = emulatorHost.includes('://')
    ? emulatorHost
    : `http://${emulatorHost}`;
  const app = initializeApp({ projectId }, 'pgnt-auth-emulator-identity');
  try {
    const account = await createEmulatorUser(host, 'identity');
    const auth = getAuth(app);
    const middleware = createFirebaseAuthMiddleware({
      projectId,
      verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked),
    });
    const req = makeRequest(account.idToken, {
      uid: 'attacker-controlled-uid',
      phoneNumber: '+33123456789',
      installId: 'untrusted-install-id',
    });
    const res = responseRecorder();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.auth.uid, account.localId);
    assert.equal(req.auth.phoneNumber, null);
    assert.notEqual(req.auth.uid, req.body.uid);
    assert.equal(Object.isFrozen(req.auth), true);
  } finally {
    await deleteApp(app);
  }
});

test('Firebase Auth Emulator identity enforces Owner and Support RBAC permissions', {
  skip: !emulatorHost && 'Set FIREBASE_AUTH_EMULATOR_HOST to run this integration test.',
}, async () => {
  const host = emulatorHost.includes('://')
    ? emulatorHost
    : `http://${emulatorHost}`;
  const app = initializeApp({ projectId }, 'pgnt-auth-emulator-rbac');
  try {
    const ownerAccount = await createEmulatorUser(host, 'owner');
    const supportAccount = await createEmulatorUser(host, 'support');
    const auth = getAuth(app);
    const firebaseAuthMiddleware = createFirebaseAuthMiddleware({
      projectId,
      verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked),
    });
    const rbac = createAdminRbac({
      firebaseAuthMiddleware,
      ownerUid: ownerAccount.localId,
      supportUid: supportAccount.localId,
    });

    const supportReq = makeRequest(supportAccount.idToken, { role: 'owner' });
    const supportRes = responseRecorder();
    let supportAuthenticated = false;
    await rbac.authenticateAdmin(supportReq, supportRes, () => { supportAuthenticated = true; });
    assert.equal(supportAuthenticated, true);
    assert.equal(supportReq.admin.role, 'support');

    let replyAllowed = false;
    rbac.requireAdminPermission('support.tickets.reply')(supportReq, supportRes, () => {
      replyAllowed = true;
    });
    assert.equal(replyAllowed, true);

    const ownerOnlyRes = responseRecorder();
    let ownerOnlyAllowed = false;
    rbac.requireAdminPermission('owner.only')(supportReq, ownerOnlyRes, () => {
      ownerOnlyAllowed = true;
    });
    assert.equal(ownerOnlyAllowed, false);
    assert.equal(ownerOnlyRes.statusCode, 403);

    const ownerReq = makeRequest(ownerAccount.idToken, { role: 'support' });
    const ownerRes = responseRecorder();
    let ownerAuthenticated = false;
    await rbac.authenticateAdmin(ownerReq, ownerRes, () => { ownerAuthenticated = true; });
    assert.equal(ownerAuthenticated, true);
    assert.equal(ownerReq.admin.role, 'owner');

    let ownerPermissionAllowed = false;
    rbac.requireAdminPermission('owner.only')(ownerReq, ownerRes, () => {
      ownerPermissionAllowed = true;
    });
    assert.equal(ownerPermissionAllowed, true);
  } finally {
    await deleteApp(app);
  }
});
