'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationSource = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('payment currency migration is additive and preserves existing pricing/catalog data', () => {
  const start = migrationSource.indexOf('const paymentCurrencyVersion = "016_payment_currency_settings"');
  const end = migrationSource.indexOf('} catch (error)', start);
  assert.ok(start >= 0 && end > start, 'version 016 migration exists');
  const migration = migrationSource.slice(start, end);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_currency_settings/);
  assert.match(migration, /ON CONFLICT \(currency\) DO NOTHING/);
  assert.doesNotMatch(migration, /UPDATE\s+(pricing_settings|product_catalog)/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+(pricing_settings|product_catalog)/i);
  assert.match(migration, /'EUR', 1, TRUE/);
  assert.match(migration, /'USD', NULL, FALSE/);
  assert.match(migration, /'GBP', NULL, FALSE/);
});

test('payment currency registry only seeds EUR as active and restricts supported codes', () => {
  const start = migrationSource.indexOf('const paymentCurrencyVersion = "016_payment_currency_settings"');
  const end = migrationSource.indexOf('} catch (error)', start);
  const migration = migrationSource.slice(start, end);
  assert.match(migration, /CHECK \(currency IN \('EUR', 'USD', 'GBP'\)\)/);
  assert.match(migration, /CHECK \(currency <> 'EUR' OR rate_per_eur = 1 OR rate_per_eur IS NULL\)/);
});

test('public payment currency endpoint is read-only and never enables USD or GBP checkout', () => {
  const start = serverSource.indexOf("app.get('/api/payment-currencies'");
  const end = serverSource.indexOf("app.get('/api/pricing/quote'", start);
  assert.ok(start >= 0 && end > start, 'read-only payment currency endpoint exists');
  const route = serverSource.slice(start, end);
  assert.match(route, /SELECT currency, rate_per_eur, active/);
  assert.match(route, /checkoutEnabled: currency === 'EUR' && active/);
  assert.doesNotMatch(route, /\b(INSERT|UPDATE|DELETE)\s+(INTO\s+)?payment_currency_settings/i);
});
