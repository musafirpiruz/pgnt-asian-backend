'use strict';

// Firebase Admin is initialized only when explicit server-side credentials
// are configured. Missing or invalid configuration leaves auth fail-closed.
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function initializeFirebaseAdmin({
  env = process.env,
  adminApps = { getApps, initializeApp, cert },
  getAuthInstance = getAuth,
} = {}) {
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  const serviceAccountJson = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();

  if (!projectId || !serviceAccountJson) {
    return { configured: false, projectId: null, verifyIdToken: null };
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (_) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.');
  }

  if (
    !serviceAccount ||
    typeof serviceAccount !== 'object' ||
    serviceAccount.project_id !== projectId ||
    typeof serviceAccount.client_email !== 'string' ||
    typeof serviceAccount.private_key !== 'string'
  ) {
    throw new Error('Firebase service account does not match FIREBASE_PROJECT_ID.');
  }

  const appName = 'pgnt-asian-topup-auth';
  const existing = adminApps.getApps().find((app) => app.name === appName);
  const app = existing || adminApps.initializeApp({
    credential: adminApps.cert(serviceAccount),
    projectId,
  }, appName);
  const auth = getAuthInstance(app);

  return {
    configured: true,
    projectId,
    verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked),
  };
}

module.exports = { initializeFirebaseAdmin };
