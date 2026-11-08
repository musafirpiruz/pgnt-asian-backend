'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const fixture196 = fs.readFileSync(path.join(__dirname, 'fixtures', 'country-registry-196.sql'), 'utf8');
const fixture204 = fs.readFileSync(path.join(__dirname, 'fixtures', 'country-registry-204.sql'), 'utf8');
const reconcile = fs.readFileSync(path.join(__dirname, 'fixtures', 'canonical-country-registry-reconciliation.sql'), 'utf8');

let schemaCounter = 0;
async function inSchema(prefix, callback) {
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration tests');
  const schema = `${prefix}_${process.pid}_${++schemaCounter}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await callback(client, schema);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

async function assertCanonical(client, schema) {
  const countries = await client.query(
    'SELECT country_code FROM country_registry ORDER BY country_code'
  );
  assert.deepEqual(countries.rows.map(row => row.country_code.trim()), ['AF','BD','IN','PK']);

  const fks = await client.query(`
    SELECT child.relname AS child_table, parent.relname AS parent_table
    FROM pg_constraint c
    JOIN pg_class child ON child.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=child.relnamespace
    JOIN pg_class parent ON parent.oid=c.confrelid
    WHERE c.contype='f' AND n.nspname=$1
      AND child.relname IN ('country_localizations','country_operators')
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid=child.oid AND attname='country_code')]::smallint[]
    ORDER BY child.relname
  `, [schema]);
  for (const row of fks.rows) assert.equal(row.parent_table, 'country_registry');
  if (await client.query(`SELECT to_regclass($1) AS name`, [`${schema}.country_localizations`]).then(r=>r.rows[0].name)) {
    const orphan = await client.query(`
      SELECT COUNT(*)::int AS count FROM country_localizations l
      LEFT JOIN country_registry r ON r.country_code=l.country_code
      WHERE r.country_code IS NULL
    `);
    assert.equal(orphan.rows[0].count, 0);
  }
}

test('canonical registry reconciliation supports a clean install', async () => {
  await inSchema('registry_clean', async (client, schema) => {
    await client.query(reconcile);
    const result = await client.query('SELECT COUNT(*)::int AS count FROM country_registry');
    assert.equal(result.rows[0].count, 0);
    await assertCanonical(client, schema);
    await client.query(reconcile);
    const ledger = await client.query('SELECT COUNT(*)::int AS count FROM country_registry_reconciliation');
    assert.equal(ledger.rows[0].count, 1);
  });
});

test('canonical registry reconciliation upgrades the PR #196 schema and preserves country/localization rows', async () => {
  await inSchema('registry_196', async (client, schema) => {
    await client.query(fixture196);
    const before = await client.query('SELECT COUNT(*)::int AS count FROM country_localizations');
    assert.equal(before.rows[0].count, 24);
    const inserted = await client.query(`
      INSERT INTO country_operators(country_code,operator_key,display_name,provider_operator_id,active)
      VALUES ('AF','af-test-net','Test Network','dtone-op-001',TRUE)
      RETURNING id
    `);
    await client.query(`
      INSERT INTO country_operator_localizations(country_code,operator_key,language_code,display_name)
      VALUES ('AF','af-test-net','ps','ازمایښتي شبکه')
    `);
    await client.query(reconcile);
    await assertCanonical(client, schema);
    const after = await client.query('SELECT COUNT(*)::int AS count FROM country_localizations');
    assert.equal(after.rows[0].count, 24);
    const legacy = await client.query(`SELECT status FROM country_registry WHERE country_code='AF'`);
    assert.equal(legacy.rows[0].status, 'legacy');
    const operator = await client.query(`
      SELECT o.operator_key,o.provider_operator_id,o.active,l.operator_id,l.display_name
      FROM country_operators o
      JOIN country_operator_localizations l ON l.operator_id=o.id
      WHERE o.country_code='AF'
    `);
    assert.equal(operator.rows.length, 1);
    assert.equal(operator.rows[0].operator_key, 'af-test-net');
    assert.equal(operator.rows[0].provider_operator_id, 'dtone-op-001');
    assert.equal(operator.rows[0].active, false, 'legacy rows without verified_at must remain inactive');
    assert.equal(operator.rows[0].display_name, 'ازمایښتي شبکه');
  });
});

test('canonical registry reconciliation accepts the PR #204 schema without creating a second country parent', async () => {
  await inSchema('registry_204', async (client, schema) => {
    await client.query(fixture204);
    const inserted = await client.query(`
      INSERT INTO country_operators(country_code,provider,provider_operator_id,operator_key,display_name,active,verified_at)
      VALUES ('AF','dtone','dtone-op-204','af-dtone-204','DT One Network',TRUE,NOW())
      RETURNING id
    `);
    await client.query(`
      CREATE TABLE country_operator_localizations (
        operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE CASCADE,
        language_code VARCHAR(8) NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(operator_id,language_code)
      )
    `);
    await client.query(`
      INSERT INTO country_operator_localizations(operator_id,language_code,display_name)
      VALUES ($1,'ps','ډي ټي ون شبکه')
    `, [inserted.rows[0].id]);
    await assertCanonical(client, schema);
    await client.query(reconcile);
    await assertCanonical(client, schema);
    const roots = await client.query(`
      SELECT COUNT(*)::int AS count FROM information_schema.tables
      WHERE table_schema=$1 AND table_name IN ('countries','country_registry')
    `, [schema]);
    assert.equal(roots.rows[0].count, 1);
    const operator = await client.query(`
      SELECT o.operator_key,o.provider_operator_id,o.active,l.display_name
      FROM country_operators o
      JOIN country_operator_localizations l ON l.operator_id=o.id
      WHERE o.country_code='AF'
    `);
    assert.equal(operator.rows.length, 1);
    assert.equal(operator.rows[0].operator_key, 'af-dtone-204');
    assert.equal(operator.rows[0].provider_operator_id, 'dtone-op-204');
    assert.equal(operator.rows[0].active, true);
    assert.equal(operator.rows[0].display_name, 'ډي ټي ون شبکه');
  });
});

test('canonical registry reconciliation rolls back on conflicting country identity', async () => {
  await inSchema('registry_conflict', async (client) => {
    await client.query(fixture196);
    await client.query(`
      CREATE TABLE country_registry (
        country_code CHAR(2) PRIMARY KEY,
        country_name VARCHAR(120) NOT NULL,
        destination_currency CHAR(3) NOT NULL,
        calling_code VARCHAR(8),
        phone_min_digits SMALLINT,
        phone_max_digits SMALLINT,
        provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
        provider_country_code VARCHAR(8),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        configuration_version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`INSERT INTO country_registry(country_code,country_name,destination_currency)
      VALUES ('AF','Wrong Name','AFN')`);
    await assert.rejects(client.query(reconcile), /conflicting country rows/);
    await client.query('ROLLBACK').catch(() => {});
    const preserved = await client.query(`SELECT country_name FROM country_registry WHERE country_code='AF'`);
    assert.equal(preserved.rows[0].country_name, 'Wrong Name');
  });
});
