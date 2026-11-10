'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { resolveApprovedFxObservation } = require('../fx-observation');

const databaseUrl = process.env.DATABASE_URL;
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'current-render-country-registry-schema.sql'), 'utf8');
const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'migrations', '023_current_catalog_country_registry_bootstrap.sql'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '024_country_fx_rates.sql'), 'utf8');
let counter = 0;

async function withSchema(callback) {
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration tests');
  const schema = `country_fx_024_${process.pid}_${++counter}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(fixture);
    await client.query(bootstrap);
    await callback(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

test('migration 024 creates canonical EUR reference rates without approving or rewriting legacy pricing', async () => {
  await withSchema(async (client) => {
    await client.query(migration);
    const schema = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='country_fx_rates'
      ORDER BY ordinal_position
    `);
    assert.ok(schema.rows.some(row => row.column_name === 'quote_per_base'));
    assert.ok(schema.rows.some(row => row.column_name === 'is_approved'));
    const rows = await client.query('SELECT COUNT(*)::int AS count FROM country_fx_rates');
    assert.equal(rows.rows[0].count, 0, 'legacy FX values must not be silently imported');
    const pricing = await client.query("SELECT country,local_currency_per_eur::text AS rate FROM pricing_settings ORDER BY country");
    assert.deepEqual(pricing.rows.map(row => [row.country.trim(), row.rate]), [
      ['AF','72.9927'],['BD','138.6300'],['IN','106.4700'],['PK','310.7630']
    ]);
    await client.query(migration);
    const version = await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version='024_country_fx_rates'");
    assert.equal(version.rows[0].count, 1);
  });
});

test('FX observations default to unapproved and enforce country/currency identity and timestamps', async () => {
  await withSchema(async (client) => {
    await client.query(migration);
    const inserted = await client.query(`
      INSERT INTO country_fx_rates(country_code,quote_currency,quote_per_base,source,observed_at,expires_at)
      VALUES ('PK','PKR',310.76,'test-feed','2026-11-10T00:00:00Z','2026-11-15T00:00:00Z')
      RETURNING is_approved,approved_at
    `);
    assert.deepEqual(inserted.rows[0], { is_approved: false, approved_at: null });
    await assert.rejects(client.query(`
      INSERT INTO country_fx_rates(country_code,quote_currency,quote_per_base,source,observed_at,expires_at)
      VALUES ('PK','AFN',75,'test-feed','2026-11-10T00:00:00Z','2026-11-15T00:00:00Z')
    `), /country_fx_rates_country_code_fkey|violates foreign key/i);
    await assert.rejects(client.query(`
      INSERT INTO country_fx_rates(country_code,quote_currency,quote_per_base,source,observed_at,expires_at,is_approved)
      VALUES ('PK','PKR',310.76,'test-feed','2026-11-10T00:00:00Z','2026-11-15T00:00:00Z',TRUE)
    `), /check constraint/i, 'approval requires approved_at');
  });
});

test('approved FX selector uses only matching current currency observations from PostgreSQL rows', async () => {
  await withSchema(async (client) => {
    await client.query(migration);
    await client.query(`
      INSERT INTO country_fx_rates(country_code,quote_currency,quote_per_base,source,observed_at,expires_at,is_approved,approved_at)
      VALUES
        ('PK','PKR',310.76,'verified-feed','2026-11-10T00:00:00Z','2026-11-15T00:00:00Z',TRUE,'2026-11-10T01:00:00Z'),
        ('AF','AFN',72.99,'verified-feed','2026-11-10T00:00:00Z','2026-11-15T00:00:00Z',TRUE,'2026-11-10T01:00:00Z')
    `);
    const result = await client.query(`
      SELECT base_currency,quote_currency,quote_per_base,source,source_reference,observed_at,expires_at,is_approved
      FROM country_fx_rates
      WHERE country_code='PK' AND base_currency='EUR' AND quote_currency='PKR' AND is_approved=TRUE
      ORDER BY observed_at DESC
    `);
    const resolved = resolveApprovedFxObservation(result.rows, 'PKR', { now: Date.parse('2026-11-10T12:00:00Z') });
    assert.equal(resolved.quotePerBase, 310.76);
    assert.equal(resolved.quoteCurrency, 'PKR');
    assert.throws(() => resolveApprovedFxObservation(result.rows, 'AFN', { now: Date.parse('2026-11-10T12:00:00Z') }), /No approved, current/);
  });
});
