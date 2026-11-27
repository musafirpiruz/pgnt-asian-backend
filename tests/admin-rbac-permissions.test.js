'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { permissionForAdminRequest, SUPPORT_PERMISSIONS } = require('../admin-rbac');

test('support escalation uses a dedicated POST permission', () => {
  assert.equal(
    permissionForAdminRequest({ method: 'POST', path: '/api/admin/support/tickets/42/escalate' }),
    'support.tickets.escalate'
  );
  assert.ok(SUPPORT_PERMISSIONS.includes('support.tickets.escalate'));
});

test('ordinary ticket reply cannot be used as an escalation', () => {
  assert.equal(
    permissionForAdminRequest({ method: 'PATCH', path: '/api/admin/support/tickets/42' }),
    'support.tickets.reply'
  );
  assert.equal(
    permissionForAdminRequest({ method: 'POST', path: '/api/admin/support/tickets/42' }),
    'owner.only'
  );
});

test('malformed escalation paths are denied by default', () => {
  for (const path of [
    '/api/admin/support/tickets/0/escalate',
    '/api/admin/support/tickets/42/escalate/extra',
    '/api/admin/support/tickets/not-a-number/escalate',
  ]) {
    assert.equal(permissionForAdminRequest({ method: 'POST', path }), 'owner.only');
  }
});

test('owner-only finance and catalog routes remain owner-only', () => {
  assert.equal(permissionForAdminRequest({ method: 'POST', path: '/api/admin/refunds' }), 'owner.only');
  assert.equal(permissionForAdminRequest({ method: 'PATCH', path: '/api/admin/products/42' }), 'owner.only');
});

test('escalation acknowledgement and resolution remain Owner-only', () => {
  for (const path of [
    '/api/admin/support/escalations/1/acknowledge',
    '/api/admin/support/escalations/1/resolve',
    '/api/admin/support/escalations/not-a-number/resolve',
    '/api/admin/support/escalations/1/acknowledge/extra',
  ]) {
    assert.equal(permissionForAdminRequest({ method: 'POST', path }), 'owner.only');
  }
});


test('every registered admin API route is guarded by requireAdmin', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sources = ['server.js', 'support-routes.js'].map((file) => ({
    file,
    lines: fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split('\n'),
  }));
  let total = 0;
  for (const source of sources) {
    for (let index = 0; index < source.lines.length; index += 1) {
      const line = source.lines[index];
      if (!/app\.(?:get|post|patch|put|delete)\(/.test(line) || !line.includes('/api/admin/')) continue;
      total += 1;
      const declaration = source.lines.slice(index, index + 3).join(' ');
      assert.match(declaration, /requireAdmin/, source.file + ':' + (index + 1) + ' must be protected');
    }
  }
  assert.ok(total >= 38, 'expected to inventory all admin API routes');
});
