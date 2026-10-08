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

    const check =
      await client.query(
        `
        SELECT version
        FROM schema_migrations
        WHERE version = $1
        LIMIT 1
        `,
        ["001_initial"]
      );

    if (check.rows.length > 0) {
      console.log(
        "Migration 001_initial is already applied."
      );

      return;
    }

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
      "Executing database.sql..."
    );

    /*
     * database.sql already contains
     * its own transaction statements.
     */
    await client.query(sql);

    await client.query(
      `
      INSERT INTO schema_migrations (
        version
      )
      VALUES ($1)
      ON CONFLICT (version)
      DO NOTHING
      `,
      ["001_initial"]
    );

    console.log(
      "Migration 001_initial completed successfully."
    );
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
