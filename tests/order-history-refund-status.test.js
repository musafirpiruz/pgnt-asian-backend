'use strict';

// Source-level regression checks for completed-order history and refund status
// visibility. These tests do not call a live database, Stripe, DT One, or users.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('customer order history status endpoint requires a per-order access token', () => {
  const start = server.indexOf("app.get('/api/orders/:orderId/status'");
  const end = server.indexOf("\n// Register the tightly restricted DT One", start);
  assert.notEqual(start, -1, 'order status endpoint must exist');
  assert.ok(end > start, 'order status endpoint must have a bounded section');
  const route = server.slice(start, end);

  assert.match(route, /x-order-access-token/);
  assert.match(route, /order_access_token_hash/);
  assert.match(route, /createHash\('sha256'\)/);
  assert.match(route, /constantTimeEqual/);
  assert.match(route, /return res\.status\(404\)\.json\(\{ error: 'Order not found\.' \}\)/);
});

test('customer history returns the authoritative order and refund state without sensitive refund details', () => {
  const start = server.indexOf("app.get('/api/orders/:orderId/status'");
  const end = server.indexOf("\n// Register the tightly restricted DT One", start);
  const route = server.slice(start, end);

  assert.match(route, /SELECT o\.order_id, o\.country, o\.currency, o\.charge_cents, o\.status/);
  assert.match(route, /refund_status/);
  assert.match(route, /amountCents: Number\(order\.charge_cents\)/);
  assert.match(route, /status: order\.status/);
  assert.match(route, /refundStatus: order\.refund_status \|\| null/);
  assert.doesNotMatch(route, /refund_reason|order_access_token_hash:\s*order|phone:/i);
});

test('Flutter persists transaction history locally and keeps order access tokens in secure storage', () => {
  assert.match(flutter, /_historyStorageKey/);
  assert.match(flutter, /SharedPreferences\.getInstance\(\)/);
  assert.match(flutter, /jsonEncode\(transactions\.map\(\(item\) => item\.toJson\(\)\)\.toList\(\)\)/);
  assert.match(flutter, /_secureStorage\.write\(/);
  assert.match(flutter, /key: _tokensStorageKey/);
  assert.match(flutter, /await refreshAllOrderStatuses\(\)/);
});

test('Flutter maps completed, declined, pending-refund and review-refund states into history labels', () => {
  const start = flutter.indexOf('TransactionStatus _statusFromServer(');
  const end = flutter.indexOf('\n  Future<void> refreshOrderStatus(', start);
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const mapper = flutter.slice(start, end);

  assert.match(mapper, /refund == 'succeeded'/);
  assert.match(mapper, /TransactionStatus\.refunded/);
  assert.match(mapper, /refund == 'pending'/);
  assert.match(mapper, /TransactionStatus\.refundPending/);
  assert.match(mapper, /TransactionStatus\.refundNeedsReview/);
  assert.match(mapper, /case 'completed':/);
  assert.match(mapper, /TransactionStatus\.successful/);
  assert.match(mapper, /case 'declined':/);
  assert.match(mapper, /TransactionStatus\.failed/);
  assert.match(mapper, /case 'topup_review':/);
  assert.match(mapper, /TransactionStatus\.underReview/);
});

test('Flutter refreshes server status and persists changes without losing original transaction fields', () => {
  const start = flutter.indexOf('Future<void> refreshOrderStatus(String orderId)');
  const end = flutter.indexOf('\n  Future<void> _pollOrderStatus(', start);
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const refresh = flutter.slice(start, end);

  assert.match(refresh, /x-order-access-token/);
  assert.match(refresh, /decoded\['status'\]/);
  assert.match(refresh, /decoded\['refundStatus'\]/);
  assert.match(refresh, /status: nextStatus/);
  assert.match(refresh, /createdAt: current\.createdAt/);
  assert.match(refresh, /orderId: current\.orderId/);
  assert.match(refresh, /await _persistTransactions\(\)/);
});
