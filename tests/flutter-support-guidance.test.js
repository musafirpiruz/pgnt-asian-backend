'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Flutter support guidance reflects the active transaction-ticket workflow', () => {
  const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  assert.match(flutter, /you can submit a support ticket using the transaction from your history/i);
  assert.doesNotMatch(flutter, /Direct ticket submission and automatic refund review still require a connected support service/i);
});
