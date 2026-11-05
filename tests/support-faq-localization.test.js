'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
const translationsStart = source.indexOf('const Map<String, Map<String, String>> translations');
assert.ok(translationsStart >= 0, 'localized customer translations must exist');
const translations = source.slice(translationsStart);

for (const language of ['ps', 'fa', 'en', 'ur', 'hi', 'bn']) {
  test(`support FAQ questions and safe answers exist for ${language}`, () => {
    const match = new RegExp(
      `['"]${language}['"]\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`
    ).exec(translations);
    assert.ok(match, `missing ${language} translation block`);
    const block = match[1];
    for (const key of [
      'faqCheckQ',
      'faqCheckA',
      'faqDelayQ',
      'faqDelayA',
      'faqFailQ',
      'faqFailA',
      'faqPaymentQ',
      'faqPaymentA',
      'faqPrivacyQ',
      'faqPrivacyA',
    ]) {
      assert.match(block, new RegExp(`['"]${key}['"]\\s*:\\s*["'][^"']+["']`), `${language} is missing ${key}`);
    }
  });
}

test('support guidance tells customers not to repay immediately and distinguishes payment from top-up completion', () => {
  const english = /['"]en['"]\s*:\s*\{([\s\S]*?)\n\s*\},/.exec(translations)?.[1] || '';
  assert.match(english, /Do not pay again immediately/);
  assert.match(english, /does not by itself mean the mobile operator has completed the top-up/);
  assert.match(english, /Never share your password, full card details/);
});

test('support screen exposes FAQ guidance and a live-agent availability caveat', () => {
  assert.match(source, /Find guidance for payments, mobile top-ups and order problems/);
  assert.match(source, /Automated help is available at any time\. Live-agent response depends on support availability/);
});
