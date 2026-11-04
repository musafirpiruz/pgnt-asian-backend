'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationSource = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

function migration023() {
  const start = migrationSource.indexOf('const countryLocalizationRepairVersion = "023_repair_country_localizations"');
  const end = migrationSource.indexOf('} catch (error)', start);
  assert.ok(start >= 0 && end > start, 'migration 023 exists after the current country FX migration');
  return migrationSource.slice(start, end);
}

test('migration 023 repairs existing fallback labels with an idempotent upsert', () => {
  const migration = migration023();
  assert.match(migration, /ON CONFLICT \(country_code, language_code\)\s+DO UPDATE SET/);
  assert.match(migration, /display_name = EXCLUDED\.display_name/);
  assert.match(migration, /is_fallback = FALSE/);
  assert.match(migration, /updated_at = NOW\(\)/);
  assert.match(migration, /023_repair_country_localizations/);
});

test('migration 023 contains reviewed labels for AF, PK, IN and BD in all six app languages', () => {
  const migration = migration023();
  for (const row of [
    "('AF','en','Afghanistan',FALSE)",
    "('AF','ps','افغانستان',FALSE)",
    "('AF','fa','افغانستان',FALSE)",
    "('AF','hi','अफ़ग़ानिस्तान',FALSE)",
    "('AF','bn','আফগানিস্তان',FALSE)",
    "('PK','ur','پاکستان',FALSE)",
    "('IN','ps','هند',FALSE)",
    "('IN','ur','بھارت',FALSE)",
    "('BD','ps','بنګله‌دېش',FALSE)",
    "('BD','fa','بنگلادیش',FALSE)",
    "('BD','ur','بنگلہ دیش',FALSE)",
    "('BD','hi','बांग्लादेश',FALSE)",
    "('BD','bn','বাংলাদেশ',FALSE)",
  ]) assert.ok(migration.includes(row), 'localized label exists: ' + row);
});

test('migration 023 changes only country-localization rows, not financial or catalog data', () => {
  const migration = migration023();
  assert.match(migration, /INSERT INTO country_localizations/);
  assert.doesNotMatch(migration, /\b(UPDATE|DELETE)\s+(pricing_settings|product_catalog|orders|refunds|wallets|wallet_transactions)\b/i);
});
