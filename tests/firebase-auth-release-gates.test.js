'use strict';

// Source-level release-gate tests. No Firebase project, SMS, credentials,
// customer data, or external network calls are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const gate = fs.readFileSync(path.join(root, 'global_phone_auth_gate.dart'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.dart'), 'utf8');
const phoneAuth = fs.readFileSync(path.join(root, 'phone-auth.js'), 'utf8');
const authAdapter = fs.readFileSync(path.join(root, 'firebase-admin-adapter.js'), 'utf8');

test('Firebase phone sign-in remains disabled until the final release gate', () => {
  assert.match(gate, /static const bool enabled = false/);
  assert.match(gate, /if \(!enabled\) return child/);
  assert.match(main, /if \(GlobalPhoneAuthGate\.enabled\)/);
});

test('Flutter Firebase initialization is conditional on the same disabled gate', () => {
  const initStart = main.indexOf('if (GlobalPhoneAuthGate.enabled)');
  assert.ok(initStart >= 0, 'Firebase initialization guard must exist');
  const initEnd = main.indexOf('\n}', initStart);
  assert.ok(initEnd > initStart, 'Firebase initialization guard must be bounded');
  const guarded = main.slice(initStart, initEnd);
  assert.match(guarded, /Firebase\.initializeApp/);
});

test('phone authentication backend endpoints remain deferred and never send SMS', () => {
  assert.match(phoneAuth, /PHONE_AUTH_DEFERRED/);
  assert.match(phoneAuth, /smsSent: false/);
  assert.match(phoneAuth, /intentionally disabled until Firebase Authentication/);
  assert.doesNotMatch(phoneAuth, /TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|verify\.twilio\.com/i);
});

test('Firebase Admin credentials are read only from server environment and validated against project ID', () => {
  assert.match(authAdapter, /FIREBASE_PROJECT_ID/);
  assert.match(authAdapter, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(authAdapter, /serviceAccount\.project_id !== projectId/);
  assert.match(authAdapter, /verifyIdToken\(token, checkRevoked\)/);
  assert.doesNotMatch(authAdapter, /console\.log\(.*serviceAccount|console\.log\(.*private_key/s);
});

test('Firebase client sends a fresh ID token to backend before treating sign-in as verified', () => {
  assert.match(gate, /getIdToken\(true\)/);
  assert.match(gate, /Authorization': 'Bearer \$token'/);
  assert.match(gate, /response\.statusCode != 200/);
  assert.match(gate, /FirebaseAuth\.instance\.signOut\(\)/);
});
