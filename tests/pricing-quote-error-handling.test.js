'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function loadClassifier() {
  const match = server.match(/function classifyPricingQuoteError\(error\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'pricing quote error classifier must exist');
  return vm.runInNewContext(`(${match[0]})`);
}

test('pricing quote returns 404 only when the requested catalog product does not exist', () => {
  const classify = loadClassifier();
  assert.deepEqual(
    JSON.parse(JSON.stringify(classify(new Error('Product not found.')))),
    { statusCode: 404, publicMessage: 'Product not found.' },
  );
});

test('pricing quote reports unavailable or ambiguous catalog selections as conflicts', () => {
  const classify = loadClassifier();
  assert.equal(classify(new Error('This product is currently unavailable.')).statusCode, 409);
  assert.equal(
    classify(new Error('Product selection is ambiguous; select a verified operator product.')).statusCode,
    409,
  );
});

test('database, settings, mapping and calculation errors are not mislabeled as 404', () => {
  const classify = loadClassifier();
  for (const error of [
    Object.assign(new Error('relation pricing_settings does not exist'), { code: '42P01' }),
    new Error('Pricing settings are not configured.'),
    new Error('DT One product mapping is missing.'),
    new Error('Invalid verified wholesale price in EUR cents.'),
    new Error('A fresh destination-currency FX rate is required.'),
  ]) {
    assert.equal(classify(error).statusCode, 503);
    assert.equal(classify(error).publicMessage,
      'Pricing service is temporarily unavailable. Please try again later.');
  }
});

test('pricing quote logs diagnostic fields without logging customer phone or access tokens', () => {
  const start = server.indexOf("app.get('/api/pricing/quote'");
  const end = server.indexOf('// =====================================================\n// PART 4/8', start);
  assert.ok(start >= 0 && end > start, 'pricing quote route must exist');
  const route = server.slice(start, end);
  assert.match(route, /Pricing quote calculation failed\./);
  assert.match(route, /errorCode:\s*error\?\.code/);
  assert.match(route, /databaseTable:\s*error\?\.table/);
  assert.match(route, /databaseColumn:\s*error\?\.column/);
  assert.match(route, /classifyPricingQuoteError\(error\)/);
  const diagnosticStart = route.indexOf("console.error('Pricing quote calculation failed.'");
  const diagnosticEnd = route.indexOf("const failure = classifyPricingQuoteError(error)", diagnosticStart);
  assert.ok(diagnosticStart >= 0 && diagnosticEnd > diagnosticStart,
    'structured diagnostic block must exist');
  const diagnostic = route.slice(diagnosticStart, diagnosticEnd);
  assert.doesNotMatch(diagnostic, /req\.body|req\.headers|req\.query\.phone|orderAccessToken|x-order-access-token|STRIPE_SECRET_KEY|DTONE_API_SECRET/i);
  assert.match(diagnostic, /country,/);
  assert.match(diagnostic, /productId,/);
  assert.doesNotMatch(diagnostic, /operator,|amount,/);
});

test('legacy AFN quote field uses the configured local-currency exchange rate', () => {
  assert.match(server, /afnPerEur:\s*localCurrencyPerEur/);
  assert.match(server, /exchangeRateAfnPerEur:\s*pricing\.afnPerEur/);
});
