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
  connectionString: DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,

  // Fail quickly and report a useful error instead of letting Render
  // wait until its port-scan timeout when PostgreSQL is unreachable.
  connectionTimeoutMillis: 10000,
  query_timeout: 60000,
  statement_timeout: 60000,
});

async function runMigration() {
  let client;

  try {
    console.log("Starting PGNT database migration...");
    console.log("Connecting to PostgreSQL (connection timeout: 10 seconds)...");

    client = await pool.connect();
    console.log("PostgreSQL connection established; checking migrations.");

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


    // Version 014 adds reversible, audit-preserving archival for declined sandbox orders.
    const archiveVersion = "014_declined_sandbox_order_archive";
    const archiveCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [archiveVersion]
    );
    if (archiveCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS archived_reason TEXT;
        CREATE INDEX IF NOT EXISTS idx_orders_unarchived_review
          ON orders (updated_at)
          WHERE archived_at IS NULL;
        INSERT INTO schema_migrations (version)
        VALUES ('014_declined_sandbox_order_archive')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log("Migration 014_declined_sandbox_order_archive completed successfully.");
    }

    // Version 009 adds admin-controlled per-operator fee settings.
    const operatorFeeVersion = "009_operator_pricing_settings";
    const operatorFeeCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [operatorFeeVersion]
    );
    if (operatorFeeCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS operator_pricing_settings (
          id BIGSERIAL PRIMARY KEY,
          country TEXT NOT NULL CHECK (country IN ('AF','PK','IN','BD')),
          operator TEXT NOT NULL,
          fee_eur_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_eur_cents >= 0 AND fee_eur_cents <= 100000),
          fee_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (country, operator)
        );
        CREATE INDEX IF NOT EXISTS idx_operator_pricing_country_active
          ON operator_pricing_settings (country, active);
        INSERT INTO schema_migrations (version)
        VALUES ('009_operator_pricing_settings')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log("Migration 009_operator_pricing_settings completed successfully.");
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


    // Version 008: referral links and first-successful-top-up rewards.
    // All reward grants are unique per referred customer and referral code.
    const referralVersion = '008_referral_rewards';
    const referralCheck = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1',
      [referralVersion]
    );
    if (referralCheck.rows.length === 0) {
      await client.query('BEGIN');
      try {
        await client.query(`
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_code VARCHAR(40);
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_install_id VARCHAR(128);
          CREATE TABLE IF NOT EXISTS referral_codes (
            id BIGSERIAL PRIMARY KEY,
            code VARCHAR(40) NOT NULL UNIQUE,
            owner_name VARCHAR(120) NOT NULL,
            owner_contact VARCHAR(160),
            reward_eur_cents INTEGER NOT NULL DEFAULT 7 CHECK (reward_eur_cents >= 0 AND reward_eur_cents <= 10000),
            active BOOLEAN NOT NULL DEFAULT FALSE,
            max_rewards INTEGER CHECK (max_rewards IS NULL OR max_rewards >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS referral_attributions (
            id BIGSERIAL PRIMARY KEY,
            install_id_hash CHAR(64) NOT NULL UNIQUE,
            referral_code VARCHAR(40) NOT NULL REFERENCES referral_codes(code),
            first_order_id VARCHAR(80),
            first_paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS referral_ledger (
            id BIGSERIAL PRIMARY KEY,
            referral_code VARCHAR(40) NOT NULL REFERENCES referral_codes(code),
            install_id_hash CHAR(64) NOT NULL UNIQUE,
            order_id VARCHAR(80) NOT NULL UNIQUE,
            reward_eur_cents INTEGER NOT NULL CHECK (reward_eur_cents > 0),
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','reversed')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_referral_ledger_code_status ON referral_ledger(referral_code, status);
          INSERT INTO schema_migrations (version) VALUES ('008_referral_rewards') ON CONFLICT (version) DO NOTHING;
        `);
        await client.query('COMMIT');
        console.log('Migration 008_referral_rewards completed; referral codes remain disabled by default.');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }

    // Version 009 reserves referral reward capacity at checkout.
    const referralReservationVersion = '009_referral_reward_reservations';
    const referralReservationCheck = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1',
      [referralReservationVersion]
    );
    if (referralReservationCheck.rows.length === 0) {
      await client.query('BEGIN');
      try {
        await client.query(`
          ALTER TABLE referral_ledger
            DROP CONSTRAINT IF EXISTS referral_ledger_status_check;
          ALTER TABLE referral_ledger
            ADD CONSTRAINT referral_ledger_status_check
            CHECK (status IN ('reserved','pending','approved','paid','reversed'));
          ALTER TABLE referral_ledger
            DROP CONSTRAINT IF EXISTS referral_ledger_install_id_hash_key;
          CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_ledger_active_install
            ON referral_ledger(install_id_hash)
            WHERE status IN ('reserved','pending','approved','paid');
          INSERT INTO schema_migrations (version)
          VALUES ('009_referral_reward_reservations')
          ON CONFLICT (version) DO NOTHING;
        `);
        await client.query('COMMIT');
        console.log('Migration 009_referral_reward_reservations completed successfully.');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } else {
      console.log('Migration 009_referral_reward_reservations is already applied.');
    }


    // Version 010 creates editable EUR pricing settings for all four supported countries.
    // Exchange rates below are reference estimates dated 2026-10-20, not payout/provider rates.
    // Existing country fee/rate settings are preserved; only missing country rows are seeded.
    // The legacy bonus percentage is disabled because referrals now use fixed EUR-cent rewards.
    const fourCountryPricingVersion = '010_four_country_pricing';
    const fourCountryPricingCheck = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1',
      [fourCountryPricingVersion]
    );
    if (fourCountryPricingCheck.rows.length === 0) {
      await client.query('BEGIN');
      try {
        await client.query(`
          INSERT INTO pricing_settings
            (country, fee_eur_cents, afn_per_eur, bonus_percent,
             stripe_fee_percent, stripe_fixed_fee_cents, active, updated_at)
          VALUES
            ('AF', 79, 72.8325, 0, 1.500, 25, TRUE, NOW()),
            ('PK', 79, 310.7630, 0, 1.500, 25, TRUE, NOW()),
            ('IN', 79, 106.4700, 0, 1.500, 25, TRUE, NOW()),
            ('BD', 79, 138.6300, 0, 1.500, 25, TRUE, NOW())
          ON CONFLICT (country) DO NOTHING;

          UPDATE pricing_settings
          SET bonus_percent = 0, updated_at = NOW()
          WHERE country IN ('AF', 'PK', 'IN', 'BD');

          INSERT INTO schema_migrations (version)
          VALUES ('010_four_country_pricing')
          ON CONFLICT (version) DO NOTHING;
        `);
        await client.query('COMMIT');
        console.log('Migration 010_four_country_pricing completed; four-country EUR fees and reference exchange rates are configured. Product catalog activation is unchanged.');
      } catch (migrationError) {
        await client.query('ROLLBACK');
        throw migrationError;
      }
    } else {
      console.log('Migration 010_four_country_pricing is already applied.');
    }



    // Version 011 repairs missing/zero reference FX rates in existing country rows.
    // Preserve any positive owner-edited rate; only replace NULL or non-positive values.
    const pricingRateRepairVersion = '011_repair_zero_country_fx_rates';
    const pricingRateRepairCheck = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1',
      [pricingRateRepairVersion]
    );
    if (pricingRateRepairCheck.rows.length === 0) {
      await client.query('BEGIN');
      try {
        await client.query(`
          UPDATE pricing_settings
          SET afn_per_eur = CASE country
                WHEN 'AF' THEN 72.8325
                WHEN 'PK' THEN 310.7630
                WHEN 'IN' THEN 106.4700
                WHEN 'BD' THEN 138.6300
                ELSE afn_per_eur
              END,
              updated_at = NOW()
          WHERE country IN ('AF', 'PK', 'IN', 'BD')
            AND (afn_per_eur IS NULL OR afn_per_eur <= 0);

          INSERT INTO schema_migrations (version)
          VALUES ('011_repair_zero_country_fx_rates')
          ON CONFLICT (version) DO NOTHING;
        `);
        await client.query('COMMIT');
        console.log('Migration 011_repair_zero_country_fx_rates completed; only missing or non-positive reference rates were repaired.');
      } catch (migrationError) {
        await client.query('ROLLBACK');
        throw migrationError;
      }
    } else {
      console.log('Migration 011_repair_zero_country_fx_rates is already applied.');
    }



    // Version 012 adds a country-neutral local-currency rate column.
    // Copy each country's existing saved value as-is; never infer or overwrite rates.
    const localCurrencyRateVersion = "012_country_local_currency_rates";
    const localCurrencyRateCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [localCurrencyRateVersion]
    );
    if (localCurrencyRateCheck.rows.length === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          ALTER TABLE pricing_settings
            ADD COLUMN IF NOT EXISTS local_currency_per_eur NUMERIC(12,4)
              CHECK (local_currency_per_eur IS NULL OR local_currency_per_eur > 0);
          UPDATE pricing_settings
             SET local_currency_per_eur = afn_per_eur
           WHERE local_currency_per_eur IS NULL
             AND afn_per_eur IS NOT NULL;
          INSERT INTO schema_migrations (version)
          VALUES ('012_country_local_currency_rates')
          ON CONFLICT (version) DO NOTHING;
        `);
        await client.query("COMMIT");
        console.log("Migration 012_country_local_currency_rates completed; existing rate values preserved.");
      } catch (migrationError) {
        await client.query("ROLLBACK");
        throw migrationError;
      }
    } else {
      console.log("Migration 012_country_local_currency_rates is already applied.");
    }


    // Version 013 guarantees one refund reservation per order on databases
    // created before the refunds table's UNIQUE(order_id) constraint existed.
    // Do not delete or rewrite financial records if duplicates are found:
    // fail safely and require manual reconciliation first.
    const refundUniquenessVersion = "013_refund_order_uniqueness";
    const refundUniquenessCheck = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1 LIMIT 1",
      [refundUniquenessVersion]
    );
    if (refundUniquenessCheck.rows.length === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          DO $migration$
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM refunds
              GROUP BY order_id
              HAVING COUNT(*) > 1
            ) THEN
              RAISE EXCEPTION
                'Migration 013 stopped: duplicate refunds.order_id records require manual financial reconciliation';
            END IF;

            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conrelid = 'refunds'::regclass
                AND contype = 'u'
                AND pg_get_constraintdef(oid) = 'UNIQUE (order_id)'
            ) THEN
              ALTER TABLE refunds
                ADD CONSTRAINT refunds_order_id_unique UNIQUE (order_id);
            END IF;
          END
          $migration$;
          INSERT INTO schema_migrations (version)
          VALUES ('013_refund_order_uniqueness')
          ON CONFLICT (version) DO NOTHING;
        `);
        await client.query("COMMIT");
        console.log("Migration 013_refund_order_uniqueness completed; duplicate financial rows are never auto-deleted.");
      } catch (migrationError) {
        await client.query("ROLLBACK");
        throw migrationError;
      }
    } else {
      console.log("Migration 013_refund_order_uniqueness is already applied.");
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
    if (client) {
      try {
        await client.query("SELECT pg_advisory_unlock(738291);");
      } catch (_) {}

      client.release();
    }

    await pool.end();
  }
}

runMigration();
