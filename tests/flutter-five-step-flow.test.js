'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('home top-up flow presents five numbered steps and custom amount control', () => {
  for (let step = 1; step <= 5; step += 1) {
    assert.match(dart, new RegExp('_buildStepHeader\\(' + step + ','));
  }
  assert.match(dart, /buildCustomAmountField\(\)/);
  assert.match(dart, /customAmountController\.dispose\(\)/);
});

test('custom amount is re-quoted by the server and payment remains disabled without a quote', () => {
  const start = dart.indexOf('Widget buildCustomAmountField()');
  const end = dart.indexOf('Widget buildReviewSummary()', start);
  assert.ok(start >= 0 && end > start);
  const custom = dart.slice(start, end);
  assert.match(custom, /loadPriceQuote\(\)/);
  assert.match(custom, /priceQuote = null/);
  assert.match(dart, /priceQuote == null \|\| isQuoteLoading/);
  assert.match(dart, /formattedFinalPrice/);
});

test('custom amount validation is translated in all six app languages', () => {
  for (const locale of ['ps', 'fa', 'en', 'ur', 'hi', 'bn']) {
    const start = dart.indexOf("  '" + locale + "': {");
    assert.ok(start >= 0);
    const end = dart.indexOf('\n  },', start);
    const block = dart.slice(start, end);
    assert.match(block, /'customAmount':/);
    assert.match(block, /'invalidAmount':/);
  }
});

test('review summary refreshes on recipient input and custom amount resets on country change', () => {
  assert.match(dart, /void handlePhoneChanged\(String value\)\s*\{\s*if \(mounted\) setState\(\(\) \{\}\);/);
  assert.match(dart, /phoneController\.clear\(\);\s*customAmountController\.clear\(\);/);
});
