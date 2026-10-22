// Regression tests for the Afghanistan catalog seed mapping in migration 014.
// Static checks only: no database or provider calls are made.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const integrationSql = fs.readFileSync(
  path.join(__dirname, 'afghanistan-catalog-migration.integration.sql'),
  'utf8'
);

function readSeedRows() {
  const start = migration.indexOf('const seedValues = `');
  assert.notEqual(start, -1, 'Migration 014 seedValues must exist');
  const contentStart = migration.indexOf('VALUES', start);
  const end = migration.indexOf('`;', contentStart);
  assert.ok(contentStart > start && end > contentStart, 'Migration 014 seed block must be bounded');
  const block = migration.slice(contentStart + 'VALUES'.length, end);
  const rowPattern = /\('AF',\s*'([A-Z]+)',\s*(\d+),\s*'AFN',\s*(\d+),\s*(\d+),\s*(\d+)\)/g;
  const rows = [];
  for (const match of block.matchAll(rowPattern)) {
    rows.push({
      country: 'AF',
      operator: match[1],
      amount: Number(match[2]),
      currency: 'AFN',
      productId: Number(match[3]),
      retailCents: Number(match[4]),
      wholesaleCents: Number(match[5]),
    });
  }
  return rows;
}

test('Migration 014 contains exactly the intended 26 Afghanistan products', () => {
  const rows = readSeedRows();
  assert.equal(rows.length, 26);
  const expectedOperators = ['ATOMA', 'ROSHAN', 'ETISALAT', 'AWCC', 'SALAAM'];
  for (const operator of expectedOperators) {
    const expectedAmounts = operator === 'ATOMA'
      ? [100, 115, 150, 250, 500, 1000]
      : [100, 150, 250, 500, 1000];
    assert.deepEqual(
      rows.filter(row => row.operator === operator).map(row => row.amount).sort((a,b) => a-b),
      expectedAmounts,
      `unexpected denomination list for ${operator}`
    );
  }
});

test('every catalog natural key and provider product ID is unique', () => {
  const rows = readSeedRows();
  assert.equal(new Set(rows.map(row => row.productId)).size, rows.length, 'duplicate provider product ID');
  assert.equal(new Set(rows.map(row => `${row.country}|${row.operator}|${row.amount}|${row.currency}`)).size, rows.length, 'duplicate catalog natural key');
});

test('each seed has valid positive EUR prices and wholesale cost below retail', () => {
  for (const row of readSeedRows()) {
    assert.ok(Number.isSafeInteger(row.retailCents) && row.retailCents > 0, `invalid retail price for ${row.operator}/${row.amount}`);
    assert.ok(Number.isSafeInteger(row.wholesaleCents) && row.wholesaleCents > 0, `invalid wholesale price for ${row.operator}/${row.amount}`);
    assert.ok(row.wholesaleCents <= row.retailCents, `wholesale exceeds retail for ${row.operator}/${row.amount}`);
  }
});

test('migration and PostgreSQL integration assertions keep all seeded products inactive and remove legacy bonus', () => {
  assert.match(migration, /SET\s+product_id\s*=\s*seed\.product_id,[\s\S]*?bonus_amount\s*=\s*0,[\s\S]*?active\s*=\s*FALSE/i);
  assert.match(migration, /seed\.product_id,[\s\S]*?seed\.wholesale_cents,\s*0,\s*FALSE/i);
  assert.match(integrationSql, /IF\s+active_count\s*<>\s*0/i);
  assert.match(integrationSql, /bonus_amount\s*<>\s*0/i);
});

test('ATOMA 115 AFN has the expected catalog ID and current migration pricing', () => {
  const row = readSeedRows().find(row => row.operator === 'ATOMA' && row.amount === 115);
  assert.deepEqual(row, {
    country: 'AF',
    operator: 'ATOMA',
    amount: 115,
    currency: 'AFN',
    productId: 7194,
    retailCents: 213,
    wholesaleCents: 191,
  });
});
