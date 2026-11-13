'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('legacy general bonus is forced to zero when loading pricing settings', () => {
  assert.match(server, /const bonusPercent = 0;/);
  assert.match(server, /Legacy general bonus is retired/);
});

test('top-up price calculation never reads a configured general bonus percentage', () => {
  const start = server.indexOf('function calculateFinalPrice(');
  const end = server.indexOf('// Get a quote using server-side product', start);
  assert.ok(start >= 0 && end > start);
  const calculation = server.slice(start, end);
  assert.match(calculation, /const bonusPercent = 0/);
  assert.doesNotMatch(calculation, /pricing\.bonusPercent/);
});

test('admin pricing API ignores legacy bonus input and stores zero', () => {
  const start = server.indexOf("app.put('/api/admin/pricing/:country'");
  const end = server.indexOf("app.", start + 10);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /const bonusPercent = 0/);
  assert.match(route, /bonus_percent = EXCLUDED\.bonus_percent/);
  assert.doesNotMatch(route, /Number\(body\.bonusPercent\)/);
});

test('admin UI keeps general bonus control disabled and sends zero', () => {
  assert.match(server, /id="bonusPercent"[^>]*disabled/);
  assert.match(server, /bonusPercent:0/);
});
