'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const fixture196 = fs.readFileSync(path.join(__dirname, 'fixtures', 'country-registry-196.sql'), 'utf8');
const fixture204 = fs.readFileSync(path.join(__dirname, 'fixtures', 'country-registry-204.sql'), 'utf8');

async function inspectOrder(schema, first, second, expectedParent) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(first);
    await client.query(second);

    const roots = await client.query(`
      SELECT 'countries' AS table_name, COUNT(*)::int AS row_count FROM countries
      UNION ALL
      SELECT 'country_registry', COUNT(*)::int FROM country_registry
      ORDER BY table_name
    `);
    assert.deepEqual(roots.rows, [
      { table_name: 'countries', row_count: 4 },
      { table_name: 'country_registry', row_count: 4 },
    ]);

    const foreignKeys = await client.query(`
      SELECT child.relname AS child_table, parent.relname AS parent_table
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = c.confrelid
      WHERE c.contype = 'f'
        AND child_ns.nspname = $1
        AND child.relname IN ('country_localizations', 'country_operators')
      ORDER BY child.relname
    `, [schema]);

    assert.deepEqual(foreignKeys.rows, [
      { child_table: 'country_localizations', parent_table: expectedParent },
      { child_table: 'country_operators', parent_table: expectedParent },
    ]);

    // This is intentionally a diagnostic assertion, not a compatibility pass:
    // both root registries coexist while the shared child tables bind to whichever
    // migration happened to create them first. A canonical reconciliation must
    // replace this expected finding with assertions for one parent only.
    return { schema, expectedParent, foreignKeys: foreignKeys.rows, roots: roots.rows };
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

test('PostgreSQL diagnostic: registry migrations 196 then 204 retain competing roots', async () => {
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration diagnostics');
  const result = await inspectOrder('registry_diag_196_first', fixture196, fixture204, 'countries');
  assert.equal(result.expectedParent, 'countries');
});

test('PostgreSQL diagnostic: registry migrations 204 then 196 retain competing roots', async () => {
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration diagnostics');
  const result = await inspectOrder('registry_diag_204_first', fixture204, fixture196, 'country_registry');
  assert.equal(result.expectedParent, 'country_registry');
});
