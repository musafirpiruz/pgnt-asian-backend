'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createFirebaseAuthMiddleware } = require('../firebase-auth');

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

test('Firebase Auth Emulator ID token is verified and identity cannot be overridden', {
  skip: !emulatorHost && 'Set FIREBASE_AUTH_EMULATOR_HOST to run this integration test.',
}, async () => {
  const host = emulatorHost.includes('://')
    ? emulatorHost
    : `http://${emulatorHost}`;
  const app = initializeApp({ projectId }, 'pgnt-auth-emulator-integration');
  try {
    const signUpResponse = await fetch(
      `${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `pgnt-emulator-${Date.now()}@example.test`,
          password: 'EmulatorOnly-Password-123!',
          returnSecureToken: true,
        }),
      },
    );
    const signUpBody = await signUpResponse.json();
    assert.equal(signUpResponse.ok, true, JSON.stringify(signUpBody));
    assert.equal(typeof signUpBody.idToken, 'string');
    assert.equal(typeof signUpBody.localId, 'string');

    const auth = getAuth(app);
    const middleware = createFirebaseAuthMiddleware({
      projectId,
      verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked),
    });
    const req = {
      headers: { authorization: `Bearer ${signUpBody.idToken}` },
      body: {
        uid: 'attacker-controlled-uid',
        phoneNumber: '+33123456789',
        installId: 'untrusted-install-id',
      },
    };
    const res = responseRecorder();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.auth.uid, signUpBody.localId);
    assert.equal(req.auth.phoneNumber, null);
    assert.notEqual(req.auth.uid, req.body.uid);
    assert.equal(Object.isFrozen(req.auth), true);
  } finally {
    await deleteApp(app);
  }
});
