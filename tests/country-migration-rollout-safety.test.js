'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const startup = read('migrate.js');
const m023 = read('migrations/023_current_catalog_country_registry_bootstrap.sql');
const m024 = read('migrations/024_country_fx_rates.sql');
const m025 = read('migrations/025_multi_currency_wallet_ledger_foundation.sql');
const m026 = read('migrations/026_product_provider_metadata_foundation.sql');
const m027 = read('migrations/027_product_identity_uniqueness.sql');
const m028 = read('migrations/028_order_fulfillment_type_ranged_identity.sql');
const m029 = read('migrations/029_country_sandbox_evidence.sql');

test('review-only wallet, catalog identity, ranged-order and evidence migrations stay out of startup', () => {
  for (const version of [
    '025_multi_currency_wallet_ledger_foundation',
    '026_product_provider_metadata_foundation',
    '027_product_identity_uniqueness',
    '028_order_fulfillment_type_ranged_identity',
    '029_country_sandbox_evidence',
  ]) {
    assert.doesNotMatch(startup, new RegExp(version), `${version} must not run during application startup`);
  }
});

test('country bootstrap keeps provider mappings inactive and aborts on unsafe catalog state', () => {
  assert.match(m023, /local_currency_per_eur IS NULL OR p\.local_currency_per_eur <= 0/i);
  assert.match(m023, /SELECT COUNT\(\*\) INTO bad_count FROM product_catalog WHERE active/i);
  assert.match(m023, /active BOOLEAN NOT NULL DEFAULT FALSE, verified_at TIMESTAMPTZ/i);
  assert.match(m023, /Bootstrap changed product-mapping activation or verification state/i);
  assert.doesNotMatch(m023, /SET\s+active\s*=\s*TRUE/i);
  assert.doesNotMatch(m023, /SET\s+status\s*=\s*'active'/i);
});

test('FX migration requires the country registry and never auto-approves observations', () => {
  assert.match(m024, /requires canonical country_registry/i);
  assert.match(m024, /is_approved BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(m024, /approved_at IS NULL/i);
  assert.match(m024, /ON CONFLICT\s*\(version\) DO NOTHING/i);
});

test('wallet ledger migration remains explicitly review-only and enforces journal immutability', () => {
  assert.match(m025, /REVIEW ONLY: intentionally not wired into migrate\.js/i);
  assert.match(m025, /Posted wallet ledger transactions are immutable/i);
  assert.match(m025, /Wallet ledger entries are immutable/i);
});

test('product metadata migration does not remove legacy denomination uniqueness', () => {
  assert.match(m026, /does NOT remove the legacy denomination unique constraint/i);
  assert.match(m026, /CREATE INDEX IF NOT EXISTS idx_product_catalog_country_operator_type/i);
  assert.doesNotMatch(m026, /DROP\s+CONSTRAINT/i);
});

test('product identity migration requires exact provider identity before dropping denomination uniqueness', () => {
  assert.match(m027, /product_catalog\.product_id must remain unique/i);
  assert.match(m027, /Expected exactly one legacy denomination unique constraint/i);
  assert.match(m027, /DROP CONSTRAINT %I/i);
});

test('ranged-order migration preserves existing fixed-order identity and requires ranged foundation', () => {
  assert.match(m028, /Existing orders remain FIXED/i);
  assert.match(m028, /DEFAULT 'FIXED'/i);
  assert.match(m028, /REFERENCES dtone_ranged_products/i);
  assert.match(startup, /dtone_ranged_value_foundation/);
});

test('sandbox evidence migration is country-scoped and submitted evidence is not implicitly approved', () => {
  assert.match(m029, /REFERENCES country_registry\(country_code\)/i);
  assert.match(m029, /review_status VARCHAR\(20\) NOT NULL DEFAULT 'submitted'/i);
  assert.match(m029, /'submitted','approved','rejected'/i);
});
