'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const panel = fs.readFileSync(path.join(root, 'admin-panel.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('admin country panel loads versioned configuration and exposes only non-active lifecycle states', () => {
  assert.match(panel, /adminPut\(/);
  assert.match(panel, /expectedConfigurationVersion:Number\(country\.configuration_version\)/);
  assert.match(panel, /destinationCurrency/);
  assert.match(panel, /providerCountryCode/);
  assert.match(panel, /phoneMinDigits/);
  assert.match(panel, /phoneMaxDigits/);
  assert.match(panel, /\['legacy','draft','disabled','configuring','testing'\]/);
  assert.doesNotMatch(panel, /option\.value='active'/);
  assert.match(panel, /\/configuration/);
});

test('admin country panel displays bounded audit history and handles stale versions safely', () => {
  assert.match(panel, /\/audit\?limit=50/);
  assert.match(panel, /entry\.old_values/);
  assert.match(panel, /entry\.new_values/);
  assert.match(panel, /configuration version/);
  assert.match(server, /expectedConfigurationVersion/);
  assert.match(server, /Country configuration changed since it was loaded/);
  assert.match(server, /country_registry_audit/);
});

test('admin country editor never presents activation as an editable action', () => {
  assert.match(panel, /هېواد فعال شوی نه دی/);
  assert.match(panel, /فعالول دلته نشته/);
  assert.doesNotMatch(panel, /option\.value='active'/);
});
