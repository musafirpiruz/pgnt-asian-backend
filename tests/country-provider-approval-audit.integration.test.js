'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '024_country_provider_approval_audit.sql'),
  'utf8'
);

test('approval/audit migration enforces one current sample and preserves activation gates', async () => {
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration tests');
  const schema = `approval_audit_${process.pid}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE country_operators (
        id BIGSERIAL PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE product_catalog (
        id BIGSERIAL PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT FALSE
      );
      INSERT INTO country_operators DEFAULT VALUES;
      INSERT INTO product_catalog DEFAULT VALUES;
      INSERT INTO product_catalog DEFAULT VALUES;
    `);
    await client.query(migration);

    const approval = await client.query(`
      INSERT INTO country_operator_approvals
        (operator_id,sample_product_catalog_id,provider,provider_operator_id,
         provider_product_id,destination_currency,product_type,denomination,
         retail_price_eur_cents,wholesale_price_eur_cents,verified_by,evidence)
      VALUES (1,1,'dtone','op-88','7194','AFN','FIXED_VALUE_RECHARGE',
              115,210,189,'admin_api_key','{"source":"authoritative_provider_response"}')
      RETURNING id
    `);
    assert.equal(approval.rowCount, 1);

    await assert.rejects(
      client.query(`
        INSERT INTO country_operator_approvals
          (operator_id,sample_product_catalog_id,provider,provider_operator_id,
           provider_product_id,destination_currency,product_type,denomination,
           retail_price_eur_cents,wholesale_price_eur_cents,verified_by)
        VALUES (1,2,'dtone','op-88','7195','AFN','FIXED_VALUE_RECHARGE',
                150,250,200,'admin_api_key')
      `),
      (error) => error.code === '23505'
    );

    await client.query(`
      INSERT INTO catalog_verification_audit
        (operator_id,product_catalog_id,event_type,actor_type,actor_id,outcome,evidence)
      VALUES (1,1,'sample_approved','admin_api_key','shared_admin_key',
              'success','{"approval_id":1}')
    `);

    const flags = await client.query(`
      SELECT o.active AS operator_active, p.active AS product_active
      FROM country_operators o CROSS JOIN product_catalog p
      WHERE o.id=1 AND p.id=1
    `);
    assert.deepEqual(flags.rows[0], { operator_active: false, product_active: false });

    const audit = await client.query(
      'SELECT event_type,actor_type,outcome FROM catalog_verification_audit'
    );
    assert.deepEqual(audit.rows[0], {
      event_type: 'sample_approved', actor_type: 'admin_api_key', outcome: 'success',
    });
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
});
