'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeFirebaseAdmin } = require('../firebase-admin-adapter');

const serviceAccount = {
  project_id: 'pgnt-test-project',
  client_email: 'firebase-admin@example.test',
  private_key: 'test-private-key',
};

test('does not initialize Firebase Admin when credentials are absent', () => {
  let initialized = false;
  const result = initializeFirebaseAdmin({
    env: {},
    adminApps: {
      getApps: () => [],
      initializeApp: () => { initialized = true; throw new Error('must not initialize'); },
      cert: () => ({}),
    },
    getAuthInstance: () => ({}),
  });
  assert.equal(result.configured, false);
  assert.equal(result.verifyIdToken, null);
  assert.equal(initialized, false);
});

test('initializes named Firebase Admin app and exposes token verifier', async () => {
  let initOptions;
  let initName;
  let certInput;
  let verifierArgs;
  const fakeApp = { name: 'pgnt-asian-topup-auth' };
  const result = initializeFirebaseAdmin({
    env: {
      FIREBASE_PROJECT_ID: 'pgnt-test-project',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount),
    },
    adminApps: {
      getApps: () => [],
      cert: (value) => { certInput = value; return { credential: true }; },
      initializeApp: (options, name) => {
        initOptions = options;
        initName = name;
        return fakeApp;
      },
    },
    getAuthInstance: (app) => {
      assert.equal(app, fakeApp);
      return {
        verifyIdToken: async (...args) => { verifierArgs = args; return { uid: 'verified-user' }; },
      };
    },
  });

  assert.equal(result.configured, true);
  assert.equal(result.projectId, 'pgnt-test-project');
  assert.equal(initName, 'pgnt-asian-topup-auth');
  assert.deepEqual(certInput, serviceAccount);
  assert.equal(initOptions.projectId, 'pgnt-test-project');
  const claims = await result.verifyIdToken('firebase-token', true);
  assert.deepEqual(verifierArgs, ['firebase-token', true]);
  assert.deepEqual(claims, { uid: 'verified-user' });
});

test('rejects a service account for a different Firebase project', () => {
  assert.throws(() => initializeFirebaseAdmin({
    env: {
      FIREBASE_PROJECT_ID: 'expected-project',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount),
    },
    adminApps: { getApps: () => [], initializeApp() {}, cert() {} },
    getAuthInstance: () => ({}),
  }), /does not match FIREBASE_PROJECT_ID/);
});

test('rejects malformed service-account JSON without exposing its contents', () => {
  assert.throws(() => initializeFirebaseAdmin({
    env: {
      FIREBASE_PROJECT_ID: 'pgnt-test-project',
      FIREBASE_SERVICE_ACCOUNT_JSON: 'not-json-secret',
    },
    adminApps: { getApps: () => [], initializeApp() {}, cert() {} },
    getAuthInstance: () => ({}),
  }), (error) => {
    assert.match(error.message, /valid JSON/);
    assert.doesNotMatch(error.message, /not-json-secret/);
    return true;
  });
});
