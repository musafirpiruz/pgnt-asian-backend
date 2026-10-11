const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATABASE_URL =
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL is not configured"
  );

  process.exit(1);
}

const pool = new Pool({
  connectionString:
    DATABASE_URL,

  ssl:
    process.env.NODE_ENV ===
    "production"
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

async function runMigration() {
  const client =
    await pool.connect();

  try {
    console.log(
      "Starting PGNT database migration..."
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    /*
     * Prevent two migration processes
     * from running at the same time.
     */
    await client.query(
      "SELECT pg_advisory_lock(738291);"
    );

    // Version 003 adds the editable AFN-per-EUR comparison rate to existing databases.
    const rateVersion = "003_afn_eur_rate";
    const rateCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [rateVersion]
    );
    if (rateCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE pricing_settings
          ADD COLUMN IF NOT EXISTS afn_per_eur NUMERIC(12,4)
            CHECK (afn_per_eur IS NULL OR afn_per_eur > 0);
        INSERT INTO schema_migrations (version)
        VALUES ('003_afn_eur_rate')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log("Migration 003_afn_eur_rate completed successfully.");
    }

    /*
     * Use a new version for the schema reconciliation.
     * Older installations may already have 001_initial
     * recorded, but still need the compatibility ALTERs
     * in database.sql. Never skip those changes merely
     * because the original migration was applied.
     */
    const version = "002_schema_compatibility";

    const check =
      await client.query(
        `
        SELECT version
        FROM schema_migrations
        WHERE version = $1
        LIMIT 1
        `,
        [version]
      );

    if (check.rows.length > 0) {
      console.log(
        "Migration 002_schema_compatibility is already applied."
      );
    } else {
      const sqlPath =
        path.join(
          __dirname,
          "database.sql"
        );

      if (!fs.existsSync(sqlPath)) {
        throw new Error(
          "database.sql was not found."
        );
      }

      const sql =
        fs.readFileSync(
          sqlPath,
          "utf8"
        );

      if (!sql.trim()) {
        throw new Error(
          "database.sql is empty."
        );
      }

      console.log(
        "Executing idempotent database schema reconciliation..."
      );

      /*
       * database.sql contains idempotent CREATE IF NOT EXISTS,
       * ADD COLUMN IF NOT EXISTS, and guarded seed statements.
       * It also owns its transaction boundaries.
       */
      await client.query(sql);

      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
        [version]
      );

      console.log(
        "Migration 002_schema_compatibility completed successfully."
      );
    }

    // Version 004 applies the user's initial Afghanistan fee and comparison rate once.
    // 100 AFN = EUR 1.37 => 1 EUR = 72.9927 AFN (rounded to 4 decimals).
    const initialAfPricingVersion = "004_af_initial_pricing";
    const initialAfPricingCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [initialAfPricingVersion]
    );
    if (initialAfPricingCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO pricing_settings
          (country, fee_eur_cents, afn_per_eur, bonus_percent, active, updated_at)
        VALUES ('AF', 59, 72.9927, 2.00, TRUE, NOW())
        ON CONFLICT (country) DO UPDATE SET
          fee_eur_cents = 59,
          afn_per_eur = 72.9927,
          updated_at = NOW();
        INSERT INTO schema_migrations (version)
        VALUES ('004_af_initial_pricing')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log("Migration 004_af_initial_pricing completed successfully.");
    }



  } catch (error) {
    console.error(
      "DATABASE MIGRATION FAILED:"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock(738291);"
      );
    } catch (_) {}

    client.release();

    await pool.end();
  }
}

runMigration();
