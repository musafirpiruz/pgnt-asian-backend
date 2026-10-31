'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainDart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('Flutter checkout does not send client-generated referral attribution', () => {
  assert.doesNotMatch(mainDart, /_getReferralInstallId|_referralInstallIdKey/);
  assert.doesNotMatch(mainDart, /'referralInstallId'\s*:/);
  assert.doesNotMatch(mainDart, /'referralCode'\s*:/);
  assert.match(mainDart, /\/api\/payments\/checkout/);
});
