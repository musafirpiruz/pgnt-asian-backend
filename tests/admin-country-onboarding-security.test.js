'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'expected route section is missing');
  return source.slice(from, to);
}

test('country registry administration is protected by requireAdmin', () => {
  const list = route("app.get('/api/admin/countries'", "app.post('/api/admin/countries'");
  const create = route("app.post('/api/admin/countries'", '// Read-only wallet integrity diagnostics');
  assert.match(list, /app\.get\('\/api\/admin\/countries',\s*requireAdmin,/);
  assert.match(create, /app\.post\('\/api\/admin\/countries',\s*requireAdmin,\s*express\.json\(\),/);
});

test('country draft endpoint validates metadata and supported localization languages', () => {
  const create = route("app.post('/api/admin/countries'", '// Read-only wallet integrity diagnostics');
  for (const expression of [
    /\^\[A-Z\]\{2\}\$/,
    /\^\[A-Z\]\{3\}\$/,
    /\^\\\+\[1-9\]\[0-9\]\{0,6\}\$/,
    /phoneMinDigits < 1/,
    /phoneMaxDigits > 15/,
    /allowedLanguages\.includes\(language\)/,
  ]) assert.match(create, expression);
});

test('creating a country can only create a draft without DT One identity', () => {
  const create = route("app.post('/api/admin/countries'", '// Read-only wallet integrity diagnostics');
  assert.match(create, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,'dtone',NULL,'draft'\)/);
  assert.match(create, /status: 'draft'/);
  assert.match(create, /providerCountryCode: null/);
  assert.doesNotMatch(create, /status\s*=\s*'active'/);
});
