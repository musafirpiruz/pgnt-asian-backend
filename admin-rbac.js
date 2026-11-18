'use strict';

// Role assignment is bound only to Firebase UIDs verified by firebase-auth.js.
// No role is accepted from request bodies, headers, query parameters, or custom
// token claims. The second administrator is intentionally support-only.
const SUPPORT_PERMISSIONS = Object.freeze([
  'support.orders.read_limited',
  'support.tickets.read',
  'support.tickets.reply',
  'support.tickets.escalate',
]);

function permissionForAdminRequest(req) {
  const method = String(req?.method || '').toUpperCase();
  const path = String(req?.path || req?.originalUrl || '').split('?')[0];

  if (method === 'GET' && path === '/api/admin/support/tickets') {
    return 'support.tickets.read';
  }
  if (method === 'GET' && path === '/api/admin/session') {
    return 'support.orders.read_limited';
  }
  if (method === 'PATCH' && /^\/api\/admin\/support\/tickets\/\d+$/.test(path)) {
    return 'support.tickets.reply';
  }

  // Default deny-by-role: all existing finance, catalog, payment, refund,
  // referral, wallet, DT One and configuration routes are Owner-only.
  return 'owner.only';
}

function createAdminRbac({
  firebaseAuthMiddleware,
  ownerUid,
  supportUid,
} = {}) {
  const normalizedOwnerUid = typeof ownerUid === 'string' ? ownerUid.trim() : '';
  const normalizedSupportUid = typeof supportUid === 'string' ? supportUid.trim() : '';
  const configured = typeof firebaseAuthMiddleware === 'function' &&
    normalizedOwnerUid.length > 0 &&
    normalizedSupportUid.length > 0 &&
    normalizedOwnerUid !== normalizedSupportUid;

  async function authenticateAdmin(req, res, next) {
    if (!configured) {
      return res.status(503).json({
        error: 'Two-account administrator authentication is not configured.',
        code: 'ADMIN_RBAC_NOT_CONFIGURED',
      });
    }

    let authenticated = false;
    await firebaseAuthMiddleware(req, res, () => {
      authenticated = true;
    });
    if (!authenticated) return undefined;

    const uid = typeof req.auth?.uid === 'string' ? req.auth.uid : '';
    let role;
    let permissions;

    if (uid === normalizedOwnerUid) {
      role = 'owner';
      permissions = Object.freeze(['*']);
    } else if (uid === normalizedSupportUid) {
      role = 'support';
      permissions = SUPPORT_PERMISSIONS;
    } else {
      return res.status(403).json({
        error: 'This identity is not authorized as an administrator.',
        code: 'ADMIN_IDENTITY_NOT_ALLOWED',
      });
    }

    req.admin = Object.freeze({ uid, role, permissions });
    return next();
  }

  function requireAdminPermission(permission) {
    const required = String(permission || '').trim();
    if (!required) throw new Error('A named administrator permission is required.');

    return function adminPermissionMiddleware(req, res, next) {
      const admin = req.admin;
      if (!admin || !Array.isArray(admin.permissions)) {
        return res.status(401).json({
          error: 'Administrator authentication is required.',
          code: 'ADMIN_AUTH_REQUIRED',
        });
      }
      if (admin.role === 'owner' || admin.permissions.includes(required)) {
        return next();
      }
      return res.status(403).json({
        error: 'This administrator does not have permission for this action.',
        code: 'ADMIN_PERMISSION_DENIED',
      });
    };
  }

  return Object.freeze({
    configured,
    authenticateAdmin,
    requireAdminPermission,
  });
}

module.exports = {
  createAdminRbac,
  SUPPORT_PERMISSIONS,
  permissionForAdminRequest,
};
