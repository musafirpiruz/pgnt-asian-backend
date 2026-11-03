'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationSource = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');

test('migration 018 repairs localized labels after migration 017 has already run', () => {
  const start = migrationSource.indexOf('const countryLocalizationVersion = "018_repair_country_localizations"');
  const end = migrationSource.indexOf('} catch (error)', start);
  assert.ok(start >= 0 && end > start, 'migration 018 exists');
  const migration = migrationSource.slice(start, end);
  assert.match(migration, /ON CONFLICT \(country_code, language_code\)\s+DO UPDATE SET/);
  assert.match(migration, /display_name = EXCLUDED\.display_name/);
  assert.match(migration, /is_fallback = FALSE/);
  assert.match(migration, /updated_at = NOW\(\)/);
  assert.match(migration, /018_repair_country_localizations/);
});

test('migration 018 contains reviewed names for all four countries in all six languages', () => {
  const start = migrationSource.indexOf('const countryLocalizationVersion = "018_repair_country_localizations"');
  const end = migrationSource.indexOf('} catch (error)', start);
  const migration = migrationSource.slice(start, end);
  for (const row of [
    "('AF','ps','افغانستان',FALSE)",
    "('AF','fa','افغانستان',FALSE)",
    "('AF','hi','अफ़ग़ानिस्तान',FALSE)",
    "('AF','bn','আফগানিস্তান',FALSE)",
    "('PK','ur','پاکستان',FALSE)",
    "('IN','ps','هند',FALSE)",
    "('IN','ur','بھارت',FALSE)",
    "('BD','ps','بنګله‌دېش',FALSE)",
    "('BD','fa','بنگلادیش',FALSE)",
    "('BD','ur','بنگلہ دیش',FALSE)",
    "('BD','hi','बांग्लাদেশ',FALSE)",
    "('BD','bn','বাংলাদেশ',FALSE)",
  ]) assert.ok(migration.includes(row), 'localized label exists: ' + row);
});

test('migration 018 is scoped to country localization and does not rewrite financial records', () => {
  const start = migrationSource.indexOf('const countryLocalizationVersion = "018_repair_country_localizations"');
  const end = migrationSource.indexOf('} catch (error)', start);
  const migration = migrationSource.slice(start, end);
  assert.doesNotMatch(migration, /\b(UPDATE|DELETE)\s+(pricing_settings|product_catalog|orders|refunds|wallet_ledger)\b/i);
});
