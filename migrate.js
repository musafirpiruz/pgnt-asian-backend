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


    // Version 008 adds per-order status access-token hashes.
    const orderTokenVersion = "008_order_access_token";
    const orderTokenCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [orderTokenVersion]
    );
    if (orderTokenCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS order_access_token_hash TEXT;
        INSERT INTO schema_migrations (version)
        VALUES ('008_order_access_token')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log("Migration 008_order_access_token completed successfully.");
    }

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


    // Version 005 records the ATOMA Afghanistan products from the user's DT Shop CSV.
    // They remain disabled until DT One pre-production fulfillment is verified.
    const atomaCatalogVersion = "005_atoma_af_catalog";
    const atomaCatalogCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [atomaCatalogVersion]
    );
    if (atomaCatalogCheck.rows.length === 0) {
      await client.query(
        `
        INSERT INTO product_catalog
          (country, operator, amount, currency, product_id, price_eur_cents, bonus_amount, active, updated_at)
        VALUES
          ('AF', 'ATOMA', 100,  'AFN', 7191, 165, 0, FALSE, NOW()),
          ('AF', 'ATOMA', 250,  'AFN', 7203, 411, 0, FALSE, NOW()),
          ('AF', 'ATOMA', 500,  'AFN', 7213, 821, 0, FALSE, NOW()),
          ('AF', 'ATOMA', 1000, 'AFN', 7233, 1641, 0, FALSE, NOW())
        ON CONFLICT (country, operator, amount, currency)
        DO UPDATE SET
          product_id = EXCLUDED.product_id,
          price_eur_cents = EXCLUDED.price_eur_cents,
          active = FALSE,
          updated_at = NOW();
        INSERT INTO schema_migrations (version)
        VALUES ('005_atoma_af_catalog')
        ON CONFLICT (version) DO NOTHING;
        `
      );
      console.log("Migration 005_atoma_af_catalog completed successfully (products remain disabled).");
    }


    // Version 006 adds the 115 AFN ATOMA product seen in DT Shop.
    // Keep it disabled until the DT One pre-production product lookup
    // and a safe sandbox transaction are verified.
    const atoma115Version = "006_atoma_115_afn";
    const atoma115Check = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [atoma115Version]
    );
    if (atoma115Check.rows.length === 0) {
      await client.query(
        `
        INSERT INTO product_catalog
          (country, operator, amount, currency, product_id, price_eur_cents, bonus_amount, active, updated_at)
        VALUES ('AF', 'ATOMA', 115, 'AFN', 7194, 189, 0, FALSE, NOW())
        ON CONFLICT (country, operator, amount, currency)
        DO UPDATE SET
          product_id = EXCLUDED.product_id,
          price_eur_cents = EXCLUDED.price_eur_cents,
          active = FALSE,
          updated_at = NOW();
        INSERT INTO schema_migrations (version)
        VALUES ('006_atoma_115_afn')
        ON CONFLICT (version) DO NOTHING;
        `
      );
      console.log("Migration 006_atoma_115_afn completed successfully (product remains disabled).");
    }


    // Version 007 adds wholesale and Stripe-fee fields required by server-side pricing.
    // Keep the verified ATOMA sandbox product disabled until checkout is retested.
    const wholesalePricingVersion = "007_wholesale_stripe_pricing";
    const wholesalePricingCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [wholesalePricingVersion]
    );

    if (wholesalePricingCheck.rows.length === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          ALTER TABLE pricing_settings
            ADD COLUMN IF NOT EXISTS stripe_fee_percent NUMERIC(6,3) NOT NULL DEFAULT 1.500
              CHECK (stripe_fee_percent >= 0 AND stripe_fee_percent < 100);
          ALTER TABLE pricing_settings
            ADD COLUMN IF NOT EXISTS stripe_fixed_fee_cents INTEGER NOT NULL DEFAULT 25
              CHECK (stripe_fixed_fee_cents >= 0);
          ALTER TABLE product_catalog
            ADD COLUMN IF NOT EXISTS wholesale_price_eur_cents INTEGER
              CHECK (wholesale_price_eur_cents IS NULL OR wholesale_price_eur_cents > 0);
        `);

        // Confirmed DT One pre-production values for product 7194:
        // retail €2.10, wholesale €1.89. Never enable it automatically.
        await client.query(`
          INSERT INTO product_catalog
            (country, operator, amount, currency, product_id,
             price_eur_cents, wholesale_price_eur_cents, bonus_amount, active, updated_at)
          VALUES ('AF', 'ATOMA', 115, 'AFN', 7194, 210, 189, 0, FALSE, NOW())
          ON CONFLICT (country, operator, amount, currency)
          DO UPDATE SET
            product_id = EXCLUDED.product_id,
            price_eur_cents = EXCLUDED.price_eur_cents,
            wholesale_price_eur_cents = COALESCE(
              product_catalog.wholesale_price_eur_cents,
              EXCLUDED.wholesale_price_eur_cents
            ),
            active = FALSE,
            updated_at = NOW();
        `);

        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
          [wholesalePricingVersion]
        );
        await client.query("COMMIT");
        console.log("Migration 007_wholesale_stripe_pricing completed; ATOMA product remains disabled.");
      } catch (migrationError) {
        await client.query("ROLLBACK");
        throw migrationError;
      }
    } else {
      console.log("Migration 007_wholesale_stripe_pricing is already applied.");
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
