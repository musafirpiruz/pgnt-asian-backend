'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dart = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('support FAQ content is localized in all six app languages', () => {
  for (const locale of ['ps', 'fa', 'en', 'ur', 'hi', 'bn']) {
    const start = dart.indexOf("  '" + locale + "': {");
    assert.ok(start >= 0);
    const end = dart.indexOf('\n  },', start);
    const block = dart.slice(start, end);
    for (const key of ['faqCheckQ','faqCheckA','faqDelayQ','faqDelayA','faqFailQ','faqFailA','faqPaymentQ','faqPaymentA','faqPrivacyQ','faqPrivacyA']) {
      assert.match(block, new RegExp("'" + key + "':"));
    }
  }
  assert.match(dart, /'q': t\('faqCheckQ'\)/);
  assert.match(dart, /'a': t\('faqPrivacyA'\)/);
});
