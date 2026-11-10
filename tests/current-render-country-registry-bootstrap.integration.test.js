'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'current-render-country-registry-schema.sql'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '023_current_catalog_country_registry_bootstrap.sql'), 'utf8');
let counter = 0;

async function withSchema(prefix, callback) {
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration tests');
  const schema = `${prefix}_${process.pid}_${++counter}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(fixture);
    await callback(client, schema);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

test('current Render schema bootstraps four country records without activating products', async () => {
  await withSchema('current_registry_bootstrap', async (client) => {
    await client.query(migration);
    const countries = await client.query('SELECT country_code,destination_currency,status FROM country_registry ORDER BY country_code');
    assert.deepEqual(countries.rows.map(r => [r.country_code.trim(),r.destination_currency,r.status]), [
      ['AF','AFN','legacy'],['BD','BDT','legacy'],['IN','INR','legacy'],['PK','PKR','legacy']
    ]);
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM country_operators) AS operators,
        (SELECT COUNT(*)::int FROM country_operator_products) AS mappings,
        (SELECT COUNT(*)::int FROM country_localizations) AS country_labels,
        (SELECT COUNT(*)::int FROM country_operators WHERE active OR verified_at IS NOT NULL) AS active_operators,
        (SELECT COUNT(*)::int FROM country_operator_products WHERE active OR verified_at IS NOT NULL) AS active_mappings,
        (SELECT COUNT(*)::int FROM product_catalog WHERE active) AS active_products
    `);
    assert.deepEqual(counts.rows[0], {
      operators:5, mappings:9, country_labels:24,
      active_operators:0, active_mappings:0, active_products:0
    });
    const providerIds = await client.query('SELECT COUNT(*)::int AS count FROM country_operators WHERE provider_operator_id IS NOT NULL');
    assert.equal(providerIds.rows[0].count,0,'bootstrap must not invent DT One operator IDs');
    await client.query(migration);
    const repeated = await client.query('SELECT COUNT(*)::int AS count FROM country_operators');
    assert.equal(repeated.rows[0].count,5,'bootstrap must be idempotent');
  });
});

test('current schema bootstrap aborts on a product country/currency mismatch', async () => {
  await withSchema('current_registry_bad_currency', async (client) => {
    await client.query("UPDATE product_catalog SET currency='USD' WHERE country='PK'");
    await assert.rejects(client.query(migration), /country\/currency rows outside the reviewed four-country mapping/);
  });
});

test('current schema bootstrap aborts when a country has no configured FX rate', async () => {
  await withSchema('current_registry_missing_fx', async (client) => {
    await client.query("UPDATE pricing_settings SET local_currency_per_eur=NULL WHERE country='IN'");
    await assert.rejects(client.query(migration), /Missing pricing settings or valid local FX/);
  });
});


test('current schema bootstrap aborts on a conflicting pre-existing country registry row', async () => {
  await withSchema('current_registry_conflict', async (client) => {
    await client.query(`
      CREATE TABLE country_registry (
        country_code CHAR(2) PRIMARY KEY,
        country_name VARCHAR(120) NOT NULL,
        destination_currency CHAR(3) NOT NULL,
        calling_code VARCHAR(8) NOT NULL,
        phone_min_digits SMALLINT NOT NULL,
        phone_max_digits SMALLINT NOT NULL,
        provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
        provider_country_code VARCHAR(8),
        status VARCHAR(20) NOT NULL DEFAULT 'legacy',
        configuration_version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO country_registry
        (country_code,country_name,destination_currency,calling_code,phone_min_digits,phone_max_digits)
      VALUES ('AF','Afghanistan','USD','+93',9,9);
    `);
    await assert.rejects(client.query(migration), /Conflicting existing country registry row for AF/);
  });
});

test('current schema bootstrap aborts when catalog labels collide on a stable operator key', async () => {
  await withSchema('current_registry_operator_collision', async (client) => {
    await client.query(`
      INSERT INTO product_catalog
        (country,operator,amount,currency,product_id,price_eur_cents,active)
      VALUES ('AF','ATOMA! ',200,'AFN',990002,300,FALSE);
    `);
    await assert.rejects(client.query(migration), /Operator key collision for country AF and key atoma/);
  });
});
