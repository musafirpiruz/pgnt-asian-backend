'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('country FX settings never fall back to the legacy AFN rate outside Afghanistan', () => {
  assert.match(server, /const legacyAfnFx = code === 'AF' \? settings\.afn_per_eur : null/);
  assert.match(server, /configuredFx !== null && configuredFx !== undefined[\s\S]*\? configuredFx[\s\S]*:\s*legacyAfnFx/);
  assert.doesNotMatch(server, /COALESCE\(local_currency_per_eur,\s*afn_per_eur\)/);
});

test('pricing quote exposes generic local-currency FX and keeps AFN alias Afghanistan-only', () => {
  assert.match(server, /exchangeRateLocalCurrencyPerEur:\s*pricing\.localCurrencyPerEur/);
  assert.match(server, /localCurrency:\s*product\.currency/);
  assert.match(server, /exchangeRateAfnPerEur:\s*product\.currency === 'AFN' \? pricing\.localCurrencyPerEur : null/);
  assert.match(server, /product\.localAmount \/ pricing\.localCurrencyPerEur/);
});

test('supported launch currencies remain distinct destination currencies', () => {
  for (const [country, currency] of [['AF', 'AFN'], ['PK', 'PKR'], ['IN', 'INR'], ['BD', 'BDT']]) {
    assert.ok(server.includes(`${country}: '${currency}'`));
  }
});
