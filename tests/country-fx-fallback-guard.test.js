'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy afn_per_eur fallback is restricted to Afghanistan', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.equal(
    (source.match(/CASE WHEN country = 'AF' THEN COALESCE\(local_currency_per_eur, afn_per_eur\) ELSE local_currency_per_eur END AS local_currency_per_eur/g) || []).length,
    2
  );
});

test('pricing reads do not apply the legacy AFN fallback to every country', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(source, /COALESCE\(local_currency_per_eur, afn_per_eur\) AS local_currency_per_eur/);
});
