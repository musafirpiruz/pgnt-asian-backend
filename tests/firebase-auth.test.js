'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFirebaseAuthMiddleware } = require('../firebase-auth');

const projectId = 'pgnt-test-project';
const validClaims = () => ({
  uid: 'firebase-user-123',
  sub: 'firebase-user-123',
  aud: projectId,
  iss: `https://securetoken.google.com/${projectId}`,
  exp: Math.floor(Date.now() / 1000) + 3600,
  auth_time: Math.floor(Date.now() / 1000),
  phone_number: '+33612345678',
});

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(middleware, authorization, body = {}) {
  const req = {
    headers: authorization ? { authorization } : {},
    body,
  };
  const res = responseRecorder();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test('fails closed when Firebase verifier or project ID is not configured', async () => {
  const middleware = createFirebaseAuthMiddleware({});
  const result = await invoke(middleware, 'Bearer any-token');
  assert.equal(result.res.statusCode, 503);
  assert.equal(result.res.body.code, 'FIREBASE_AUTH_NOT_CONFIGURED');
  assert.equal(result.nextCalled, false);
});

test('rejects missing and malformed bearer tokens without calling verifier', async () => {
  let calls = 0;
  const middleware = createFirebaseAuthMiddleware({
    projectId,
    verifyIdToken: async () => { calls += 1; return validClaims(); },
  });
  for (const header of [null, 'Basic abc', 'Bearer ', 'Bearer one two']) {
    const result = await invoke(middleware, header);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, false);
  }
  assert.equal(calls, 0);
});

test('verifies token with revocation check and exposes only verified identity', async () => {
  let args;
  const middleware = createFirebaseAuthMiddleware({
    projectId,
    verifyIdToken: async (...values) => { args = values; return validClaims(); },
  });
  const result = await invoke(middleware, 'Bearer signed-token', {
    uid: 'attacker-controlled-uid',
    phoneNumber: '+33111111111',
    installId: 'fake-install',
  });
  assert.equal(result.nextCalled, true);
  assert.deepEqual(args, ['signed-token', true]);
  assert.deepEqual(result.req.auth, {
    uid: 'firebase-user-123',
    phoneNumber: '+33612345678',
    authTime: validClaims().auth_time,
  });
  assert.equal(Object.isFrozen(result.req.auth), true);
});

test('rejects wrong audience, issuer, subject, missing uid and expired claims', async () => {
  const mutations = [
    (claims) => { claims.aud = 'another-project'; },
    (claims) => { claims.iss = 'https://securetoken.google.com/another-project'; },
    (claims) => { claims.sub = 'different-user'; },
    (claims) => { delete claims.uid; },
    (claims) => { claims.exp = Math.floor(Date.now() / 1000) - 1; },
  ];
  for (const mutate of mutations) {
    const middleware = createFirebaseAuthMiddleware({
      projectId,
      verifyIdToken: async () => {
        const claims = validClaims();
        mutate(claims);
        return claims;
      },
    });
    const result = await invoke(middleware, 'Bearer signed-token');
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.res.body.code, 'FIREBASE_TOKEN_INVALID');
    assert.equal(result.nextCalled, false);
  }
});

test('rejects revoked or otherwise rejected Firebase tokens without leaking verifier errors', async () => {
  const middleware = createFirebaseAuthMiddleware({
    projectId,
    verifyIdToken: async () => { throw new Error('private token and credential details'); },
  });
  const result = await invoke(middleware, 'Bearer revoked-token');
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.res.body.code, 'FIREBASE_TOKEN_REJECTED');
  assert.doesNotMatch(JSON.stringify(result.res.body), /private|credential|token and/);
});

test('requires verified E.164 phone claim only when configured', async () => {
  const middleware = createFirebaseAuthMiddleware({
    projectId,
    requirePhoneNumber: true,
    verifyIdToken: async () => ({ ...validClaims(), phone_number: '0612345678' }),
  });
  const result = await invoke(middleware, 'Bearer signed-token');
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.res.body.code, 'FIREBASE_PHONE_CLAIM_REQUIRED');
  assert.equal(result.nextCalled, false);
});
