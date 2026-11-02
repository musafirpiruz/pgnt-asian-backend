'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('admin country onboarding routes require admin authentication', () => {
  assert.match(serverSource, /app\.get\('\/api\/admin\/countries',\s*requireAdmin/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/countries',\s*requireAdmin/);
});

test('new countries are always created as draft with no provider enabled', () => {
  const start = serverSource.indexOf("app.post('/api/admin/countries'");
  const end = serverSource.indexOf("app.get('/api/admin/pricing'", start);
  assert.ok(start >= 0 && end > start, 'draft country creation route exists');
  const route = serverSource.slice(start, end);
  assert.match(route, /provider_code, status\)[\s\S]*VALUES[\s\S]*NULL, 'draft'/);
  assert.match(route, /activationPerformed: false/);
  assert.match(route, /providerEnabled: false/);
  assert.match(route, /productsActivated: false/);
  assert.doesNotMatch(route, /UPDATE\s+countries[\s\S]*status\s*=\s*'active'/i);
});

test('draft country onboarding validates identifiers and phone digit bounds', () => {
  const start = serverSource.indexOf("app.post('/api/admin/countries'");
  const end = serverSource.indexOf("app.get('/api/admin/pricing'", start);
  const route = serverSource.slice(start, end);
  assert.match(route, /\^\[A-Z\]\{2\}\$/);
  assert.match(route, /\^\[A-Z\]\{3\}\$/);
  assert.match(route, /minDigits < 4 \|\| maxDigits > 15 \|\| minDigits > maxDigits/);
  assert.match(route, /ON CONFLICT \(country_code, language_code\) DO NOTHING/);
  assert.match(route, /error\.code === '23505'/);
});


test('admin operator mappings are protected and remain inactive on creation', () => {
  assert.match(serverSource, /app\.get\('\/api\/admin\/countries\/:countryCode\/operators',\s*requireAdmin/);
  assert.match(serverSource, /app\.post\('\/api\/admin\/countries\/:countryCode\/operators',\s*requireAdmin/);
  const start = serverSource.indexOf("app.post('/api/admin/countries/:countryCode/operators'");
  const end = serverSource.indexOf("app.get('/api/admin/pricing'", start);
  assert.ok(start >= 0 && end > start, 'operator mapping route exists');
  const route = serverSource.slice(start, end);
  assert.match(route, /provider_operator_id, active\)[\s\S]*VALUES[\s\S]*FALSE/);
  assert.match(route, /activationPerformed: false/);
  assert.match(route, /error\.code === '23505'/);
});

test('new provider mappings are admin-only and remain disabled', () => {
  assert.match(serverSource, /app\\.post\\('\\/api\\/admin\\/countries\\/:countryCode\\/providers',\\s*requireAdmin/);
  const start = serverSource.indexOf("app.post('/api/admin/countries/:countryCode/providers'");
  const end = serverSource.indexOf("app.get('/api/admin/pricing'", start);
  assert.ok(start >= 0 && end > start, 'disabled provider mapping route exists');
  const route = serverSource.slice(start, end);
  assert.match(route, /country_provider_settings/);
  assert.match(route, /VALUES \\(\\$1, \\$2, \\$3, FALSE\\)/);
  assert.match(route, /fulfillmentEnabled: false/);
  assert.match(route, /activationPerformed: false/);
});
