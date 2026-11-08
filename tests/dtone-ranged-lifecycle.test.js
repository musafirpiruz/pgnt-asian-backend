'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DTOneOutcomeUnknownError,
  createRangedTransaction,
  confirmRangedTransaction,
  cancelRangedTransaction,
} = require('../dtone-ranged-lifecycle');

const base = {
  baseUrl: 'https://preprod-dvs-api.dtone.com',
  authorization: 'Basic dGVzdDpwYXNz',
  timeoutMs: 5000,
};
const capability = {
  productId: '98765',
  productType: 'RANGED_VALUE_RECHARGE',
  amountMode: 'DESTINATION_AMOUNT',
  destinationCurrency: 'AFN',
  minAmount: 10,
  maxAmount: 3000,
  increment: 10,
};
function mockFetch(status, body, inspect) {
  return async (url, init) => {
    inspect?.(url, init);
    return new Response(body == null ? '' : JSON.stringify(body), {
      status,
      headers: body == null ? {} : { 'Content-Type': 'application/json' },
    });
  };
}
function createdResponse() {
  return {
    id: 123456789,
    external_id: 'PGNT-ORDER-1',
    product: { id: 98765 },
    status: { message: 'CREATED' },
  };
}

test('creates a two-step ranged transaction with exact destination amount and auto_confirm false', async () => {
  const result = await createRangedTransaction({
    ...base,
    fetchImpl: mockFetch(201, createdResponse(), (url, init) => {
      assert.equal(url, 'https://preprod-dvs-api.dtone.com/v1/async/transactions');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.Authorization, base.authorization);
      const body = JSON.parse(init.body);
      assert.equal(body.external_id, 'PGNT-ORDER-1');
      assert.equal(body.product_id, 98765);
      assert.equal(body.calculation_mode, 'DESTINATION_AMOUNT');
      assert.deepEqual(body.destination, { unit_type: 'CURRENCY', unit: 'AFN', amount: 150 });
      assert.deepEqual(body.credit_party_identifier, { mobile_number: '+93700100100' });
      assert.equal(body.auto_confirm, false);
    }),
    productId: 98765,
    externalId: 'PGNT-ORDER-1',
    destinationAmount: 150,
    destinationCurrency: 'AFN',
    mobileNumber: '+93700100100',
    capability,
    callbackUrl: 'https://example.test/api/dtone/callback',
  });
  assert.equal(result.httpStatus, 201);
  assert.equal(result.providerResponse.id, 123456789);
});

test('rejects amount outside provider bounds or increment before any HTTP request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('should not call'); };
  await assert.rejects(createRangedTransaction({
    ...base, fetchImpl, productId: 98765, externalId: 'PGNT-ORDER-2',
    destinationAmount: 155, destinationCurrency: 'AFN',
    mobileNumber: '+93700100100', capability,
  }), /verified ranged product capability/);
  assert.equal(calls, 0);
});

test('rejects mismatched product/currency and unsafe callback URL', async () => {
  const common = {
    ...base, fetchImpl: mockFetch(201, createdResponse()),
    productId: 98765, externalId: 'PGNT-ORDER-3',
    destinationAmount: 150, destinationCurrency: 'PKR',
    mobileNumber: '+93700100100', capability,
  };
  await assert.rejects(createRangedTransaction(common), /verified ranged product capability/);
  await assert.rejects(createRangedTransaction({
    ...common, destinationCurrency: 'AFN', callbackUrl: 'http://insecure.test/callback',
  }), /must use HTTPS/);
});

test('does not retry or disguise uncertain network outcome on create', async () => {
  let calls = 0;
  await assert.rejects(createRangedTransaction({
    ...base, fetchImpl: async () => { calls++; throw new Error('socket timeout'); },
    productId: 98765, externalId: 'PGNT-ORDER-4',
    destinationAmount: 150, destinationCurrency: 'AFN',
    mobileNumber: '+93700100100', capability,
  }), (error) => error instanceof DTOneOutcomeUnknownError && error.operation === 'ranged transaction creation');
  assert.equal(calls, 1);
});

test('confirms only the saved provider transaction ID before its expiry', async () => {
  const confirmBy = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const result = await confirmRangedTransaction({
    ...base, fetchImpl: mockFetch(202, null, (url, init) => {
      assert.equal(url, 'https://preprod-dvs-api.dtone.com/v1/async/transactions/123456789/confirm');
      assert.equal(init.method, 'POST');
      assert.equal(init.body, undefined);
    }),
    transactionId: '123456789', confirmBy,
  });
  assert.equal(result.transactionId, '123456789');
  assert.equal(result.httpStatus, 202);
});

test('refuses confirmation after expiry and rejects invalid provider IDs', async () => {
  const fetchImpl = async () => { throw new Error('must not call'); };
  await assert.rejects(confirmRangedTransaction({
    ...base, fetchImpl, transactionId: '123456789',
    confirmBy: new Date(Date.now() - 1000).toISOString(),
  }), /confirmation window has expired/);
  await assert.rejects(confirmRangedTransaction({
    ...base, fetchImpl, transactionId: '../123',
    confirmBy: new Date(Date.now() + 60000).toISOString(),
  }), /valid saved DT One transaction ID/);
});

test('cancels only by the saved provider transaction ID through the documented endpoint', async () => {
  const result = await cancelRangedTransaction({
    ...base, fetchImpl: mockFetch(202, null, (url, init) => {
      assert.equal(url, 'https://preprod-dvs-api.dtone.com/v1/transactions/123456789/cancel');
      assert.equal(init.method, 'POST');
    }),
    transactionId: '123456789',
  });
  assert.equal(result.httpStatus, 202);
});

test('requires HTTPS origin and Basic authentication', async () => {
  const common = {
    fetchImpl: mockFetch(201, createdResponse()),
    productId: 98765, externalId: 'PGNT-ORDER-5',
    destinationAmount: 150, destinationCurrency: 'AFN',
    mobileNumber: '+93700100100', capability,
  };
  await assert.rejects(createRangedTransaction({
    ...common, baseUrl: 'http://preprod-dvs-api.dtone.com', authorization: base.authorization,
  }), /clean HTTPS origin/);
  await assert.rejects(createRangedTransaction({
    ...common, ...base, authorization: 'Bearer token',
  }), /Basic authentication/);
});
