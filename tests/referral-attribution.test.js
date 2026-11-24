'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { registerReferralAttributionRoute } = require('../referral-attribution');

const token = crypto.randomBytes(32).toString('base64url');
const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

function setup({ referralRows = [{ code: 'INTERNAL_ONLY' }], insertRows = [{ id: 1 }], existingRows = [] } = {}) {
  let handler;
  const app = {
    post(path, auth, callback) {
      assert.equal(path, '/api/referrals/attribute');
      handler = callback;
    },
  };
  const queries = [];
  let released = false;
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('FROM referral_codes')) return { rowCount: referralRows.length, rows: referralRows };
      if (sql.includes('INSERT INTO referral_attributions')) return { rowCount: insertRows.length, rows: insertRows };
      if (sql.includes('FROM referral_attributions')) return { rowCount: existingRows.length, rows: existingRows };
      throw new Error('Unexpected SQL in test: ' + sql);
    },
    release() { released = true; },
  };
  const pool = { async connect() { return client; } };
  const authMiddleware = (req, res, next) => {
    req.auth = { uid: 'verified-firebase-uid' };
    return next();
  };
  registerReferralAttributionRoute({ app, pool, authMiddleware });
  return {
    queries,
    get released() { return released; },
    async invoke(body = {}) {
      const req = { body: { ...body, uid: 'attacker-supplied-uid' } };
      const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
      };
      await handler(req, res);
      return { req, res };
    },
  };
}

test('new invite attribution uses only verified Firebase UID and stores only token hash lookup', async () => {
  const state = setup();
  const { req, res } = await state.invoke({ token });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.attributed, true);
  assert.equal(res.body.rewardEligible, false);
  assert.equal(JSON.stringify(res.body).includes('INTERNAL_ONLY'), false);
  assert.equal(state.queries[1].params[0], tokenHash);
  const insert = state.queries.find((entry) => entry.sql.includes('INSERT INTO referral_attributions'));
  assert.deepEqual(insert.params, ['verified-firebase-uid', 'INTERNAL_ONLY']);
  assert.equal(insert.sql.includes('install_id_hash'), true);
  assert.equal(state.queries.some((entry) => JSON.stringify(entry.params).includes(token)), false);
  assert.equal(state.queries.some((entry) => JSON.stringify(entry.params).includes('attacker-supplied-uid')), false);
  assert.ok(state.queries.some((entry) => entry.sql === 'COMMIT'));
  assert.equal(state.released, true);
});

test('same Firebase UID may repeat the same attribution idempotently', async () => {
  const state = setup({ insertRows: [], existingRows: [{ referral_code: 'INTERNAL_ONLY' }] });
  const { res } = await state.invoke({ token });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.alreadyAttributed, true);
  assert.ok(state.queries.some((entry) => entry.sql === 'COMMIT'));
});

test('a Firebase UID cannot be attributed to a different invite', async () => {
  const state = setup({ insertRows: [], existingRows: [{ referral_code: 'OTHER_CODE' }] });
  const { res } = await state.invoke({ token });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'REFERRAL_ALREADY_ATTRIBUTED');
  assert.ok(state.queries.some((entry) => entry.sql === 'ROLLBACK'));
});

test('inactive, revoked or unknown invite tokens fail without attribution', async () => {
  const state = setup({ referralRows: [] });
  const { res } = await state.invoke({ token });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'REFERRAL_LINK_UNAVAILABLE');
  assert.ok(state.queries.some((entry) => entry.sql === 'ROLLBACK'));
  assert.equal(state.queries.some((entry) => entry.sql.includes('INSERT INTO referral_attributions')), false);
});

test('malformed invite tokens are rejected before database access', async () => {
  const state = setup();
  const { res } = await state.invoke({ token: 'short' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'REFERRAL_TOKEN_INVALID');
  assert.equal(state.queries.length, 0);
  assert.equal(state.released, false);
});
