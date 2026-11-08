'use strict';

const { isValidRangedDestinationAmount } = require('./dtone-ranged');

class DTOneOutcomeUnknownError extends Error {
  constructor(operation, cause) {
    super(`DT One ${operation} outcome is unknown; reconcile by external_id or transaction ID before any retry.`);
    this.name = 'DTOneOutcomeUnknownError';
    this.operation = operation;
    this.cause = cause;
  }
}

function validateTransport({ baseUrl, authorization, fetchImpl, timeoutMs }) {
  let url;
  try {
    url = new URL(String(baseUrl || ''));
  } catch (_) {
    throw new Error('DT One API base URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new Error('DT One API base URL must be a clean HTTPS origin.');
  }
  if (typeof authorization !== 'string' || !/^Basic\s+\S+$/i.test(authorization)) {
    throw new Error('DT One Basic authentication is not configured.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('DT One HTTP transport is unavailable.');
  }
  const timeout = Number(timeoutMs ?? 15000);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 60000) {
    throw new Error('DT One request timeout is invalid.');
  }
  return { origin: url.origin, authorization, fetchImpl, timeoutMs: timeout };
}

function validateCreateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Ranged transaction input is invalid.');
  const productId = Number(input.productId);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw new Error('A verified DT One ranged product ID is required.');
  }
  const externalId = String(input.externalId || '').trim();
  if (externalId.length < 1 || externalId.length > 40 || /\s/.test(externalId)) {
    throw new Error('A unique external_id of 1–40 non-space characters is required.');
  }
  const destinationCurrency = String(input.destinationCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(destinationCurrency)) {
    throw new Error('A valid destination currency is required.');
  }
  const amount = Number(input.destinationAmount);
  if (!isValidRangedDestinationAmount(amount, input.capability) ||
      input.capability.destinationCurrency !== destinationCurrency ||
      String(input.capability.productId) !== String(productId)) {
    throw new Error('Requested amount does not match the verified ranged product capability.');
  }
  const mobileNumber = String(input.mobileNumber || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(mobileNumber)) {
    throw new Error('A valid international recipient mobile number is required.');
  }
  const callbackUrl = input.callbackUrl == null ? null : String(input.callbackUrl).trim();
  if (callbackUrl) {
    let parsed;
    try { parsed = new URL(callbackUrl); } catch (_) {
      throw new Error('DT One callback URL is invalid.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('DT One callback URL must use HTTPS.');
    }
  }
  return {
    external_id: externalId,
    product_id: productId,
    credit_party_identifier: { mobile_number: mobileNumber },
    calculation_mode: 'DESTINATION_AMOUNT',
    destination: {
      unit_type: 'CURRENCY',
      unit: destinationCurrency,
      amount,
    },
    auto_confirm: false,
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  };
}

async function requestJson(transport, operation, path, body) {
  let response;
  try {
    response = await transport.fetchImpl(`${transport.origin}${path}`, {
      method: 'POST',
      headers: {
        Authorization: transport.authorization,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(transport.timeoutMs),
    });
  } catch (error) {
    throw new DTOneOutcomeUnknownError(operation, error);
  }

  let responseText;
  try {
    responseText = await response.text();
  } catch (error) {
    throw new DTOneOutcomeUnknownError(operation, error);
  }
  let data = null;
  if (responseText) {
    try { data = JSON.parse(responseText); } catch (_) {
      throw new Error(`DT One ${operation} returned a non-JSON response (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    const error = new Error(`DT One ${operation} failed with HTTP ${response.status}; reconcile provider state before retrying.`);
    error.name = 'DTOneHttpError';
    error.statusCode = response.status;
    error.providerErrorCode = data?.errors?.[0]?.code || data?.code || null;
    throw error;
  }
  return { statusCode: response.status, data };
}

async function createRangedTransaction(options) {
  const transport = validateTransport(options || {});
  const payload = validateCreateInput(options);
  const result = await requestJson(
    transport,
    'ranged transaction creation',
    '/v1/async/transactions',
    payload
  );
  if (result.statusCode !== 201 || !result.data || typeof result.data !== 'object') {
    throw new Error('DT One ranged transaction creation did not return HTTP 201 with a transaction object.');
  }
  // Return the provider response intact so the caller can persist the provider
  // transaction ID/external ID before validating price evidence. Never retry
  // a create call after an uncertain network outcome.
  return Object.freeze({
    httpStatus: result.statusCode,
    payload,
    providerResponse: result.data,
  });
}

function validateTransactionId(value) {
  const id = String(value ?? '').trim();
  if (!/^\d+$/.test(id) || BigInt(id) <= 0n) {
    throw new Error('A valid saved DT One transaction ID is required.');
  }
  return id;
}

async function confirmRangedTransaction(options) {
  const transport = validateTransport(options || {});
  const transactionId = validateTransactionId(options.transactionId);
  const confirmBy = new Date(options.confirmBy);
  if (!Number.isFinite(confirmBy.getTime()) || confirmBy.getTime() <= Date.now()) {
    throw new Error('DT One ranged transaction confirmation window has expired.');
  }
  const result = await requestJson(
    transport,
    'ranged transaction confirmation',
    `/v1/async/transactions/${encodeURIComponent(transactionId)}/confirm`,
    null
  );
  if (result.statusCode !== 202) {
    throw new Error(`DT One confirmation did not return HTTP 202 (received ${result.statusCode}).`);
  }
  return Object.freeze({ transactionId, httpStatus: result.statusCode, providerResponse: result.data });
}

async function cancelRangedTransaction(options) {
  const transport = validateTransport(options || {});
  const transactionId = validateTransactionId(options.transactionId);
  const result = await requestJson(
    transport,
    'ranged transaction cancellation',
    `/v1/transactions/${encodeURIComponent(transactionId)}/cancel`,
    null
  );
  if (result.statusCode !== 202) {
    throw new Error(`DT One cancellation did not return HTTP 202 (received ${result.statusCode}).`);
  }
  return Object.freeze({ transactionId, httpStatus: result.statusCode, providerResponse: result.data });
}

module.exports = {
  DTOneOutcomeUnknownError,
  createRangedTransaction,
  confirmRangedTransaction,
  cancelRangedTransaction,
};
