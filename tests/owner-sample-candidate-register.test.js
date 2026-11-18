'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const register = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'PGNT_OWNER_SAMPLE_CANDIDATES_2026-11-18.md'),
  'utf8',
);

function candidatesFromRegister() {
  return register.split('\n')
    .filter(line => /^\| (Afghanistan|Bangladesh|India|Pakistan) \|/.test(line))
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim());
      return {
        country: cells[1],
        operator: cells[2],
        productId: Number(cells[3]),
        amount: Number(cells[5].replace(/,/g, '').split(' ')[0]),
      };
    });
}

test('owner sample register contains exactly 17 unique standard mobile operator candidates', () => {
  const candidates = candidatesFromRegister();
  assert.equal(candidates.length, 17);
  assert.equal(new Set(candidates.map(item => item.productId)).size, 17);
  assert.deepEqual(
    candidates.reduce((counts, item) => {
      counts[item.country] = (counts[item.country] || 0) + 1;
      return counts;
    }, {}),
    { Afghanistan: 5, Bangladesh: 5, India: 3, Pakistan: 4 },
  );
});

test('every proposed owner sample uses an integer denomination from 75 through 3000', () => {
  for (const candidate of candidatesFromRegister()) {
    assert.ok(Number.isSafeInteger(candidate.productId) && candidate.productId > 0);
    assert.ok(Number.isSafeInteger(candidate.amount));
    assert.ok(candidate.amount >= 75 && candidate.amount <= 3000);
  }
});

test('candidate register clearly marks all samples as offline proposals, not DT One approvals', () => {
  assert.match(register, /not approved samples/i);
  assert.match(register, /not live DT One verification/i);
  assert.match(register, /Activation remains a separate owner-controlled action/i);
});
