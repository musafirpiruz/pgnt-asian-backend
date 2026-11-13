'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const root = path.join(__dirname, '..');
const migration023 = fs.readFileSync(
  path.join(root, 'migrations', '023_current_catalog_country_registry_bootstrap.sql'),
  'utf8',
);
const fixture196 = fs.readFileSync(path.join(__dirname, 'fixtures', 'country-registry-196.sql'), 'utf8');
const fixture204 = fs.readFileSync(path.join(__dirname, 'fixtures', 'country-registry-204.sql'), 'utf8');

async function assertBootstrapRejectsLegacyShape({ schema, fixture, expectedCode, expectedMessage }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE pricing_settings (
        country CHAR(2) PRIMARY KEY,
        local_currency_per_eur NUMERIC(20,10) NOT NULL CHECK (local_currency_per_eur > 0)
      );
      CREATE TABLE product_catalog (
        id BIGSERIAL PRIMARY KEY,
        country CHAR(2) NOT NULL,
        operator VARCHAR(100) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency CHAR(3) NOT NULL,
        product_id BIGINT NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT FALSE
      );
      INSERT INTO pricing_settings(country, local_currency_per_eur)
      VALUES ('AF',60),('PK',300),('IN',90),('BD',130);
      INSERT INTO product_catalog(country,operator,amount,currency,product_id,active)
      VALUES
        ('AF','Network A',100,'AFN',10001,FALSE),
        ('PK','Network B',100,'PKR',10002,FALSE),
        ('IN','Network C',100,'INR',10003,FALSE),
        ('BD','Network D',100,'BDT',10004,FALSE);
    `);

    await client.query(fixture);

    const before = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM country_localizations) AS country_localizations,
        (SELECT COUNT(*)::int FROM country_operators) AS operators,
        CASE WHEN to_regclass('country_operator_localizations') IS NULL THEN 0
          ELSE (SELECT COUNT(*)::int FROM country_operator_localizations)
        END AS operator_localizations
    `);

    let migrationError;
    try {
      await client.query(migration023);
    } catch (error) {
      migrationError = error;
      await client.query('ROLLBACK');
    }

    assert.ok(migrationError, '023 must reject the incompatible pre-existing schema');
    assert.equal(migrationError.code, expectedCode, migrationError.message);
    assert.match(migrationError.message, expectedMessage);

    const after = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM country_localizations) AS country_localizations,
        (SELECT COUNT(*)::int FROM country_operators) AS operators,
        CASE WHEN to_regclass('country_operator_localizations') IS NULL THEN 0
          ELSE (SELECT COUNT(*)::int FROM country_operator_localizations)
        END AS operator_localizations
    `);
    assert.deepEqual(after.rows, before.rows, 'failed 023 must preserve existing localization and operator rows');

    const registryCount = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = 'country_operator_products'
    `, [schema]);
    assert.equal(registryCount.rows[0].count, 0, 'transactional failure must roll back 023-created tables');
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

test('023 rejects legacy-196 operator schema without damaging existing rows', {
  skip: !databaseUrl,
}, async () => {
  await assertBootstrapRejectsLegacyShape({
    schema: 'registry_023_legacy196',
    fixture: fixture196,
    expectedCode: '42703',
    expectedMessage: /column "verified_at" of relation "country_operators" does not exist/i,
  });
});

test('023 rejects newer-204 NOT NULL provider identity without damaging existing rows', {
  skip: !databaseUrl,
}, async () => {
  await assertBootstrapRejectsLegacyShape({
    schema: 'registry_023_newer204',
    fixture: fixture204,
    expectedCode: '23502',
    expectedMessage: /null value in column "provider_operator_id" of relation "country_operators"/i,
  });
});
