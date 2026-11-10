'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ranged DT One products accept future ISO country and currency codes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  const start = source.indexOf('CREATE TABLE IF NOT EXISTS dtone_ranged_products');
  assert.notEqual(start, -1, 'ranged product migration must exist');
  const end = source.indexOf(');', start);
  const tableSql = source.slice(start, end);
  assert.match(tableSql, /country_iso_code CHAR\(3\) NOT NULL\s+CHECK \(country_iso_code ~ '\^\[A-Z\]\{3\}\$'\)/);
  assert.match(tableSql, /destination_currency CHAR\(3\) NOT NULL\s+CHECK \(destination_currency ~ '\^\[A-Z\]\{3\}\$'\)/);
  assert.doesNotMatch(tableSql, /AFG|PAK|IND|BGD|AFN|PKR|INR|BDT/);
});
