BEGIN;

          CREATE TABLE IF NOT EXISTS country_registry (
            country_code CHAR(2) PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$'),
            country_name VARCHAR(120) NOT NULL,
            destination_currency CHAR(3) NOT NULL CHECK (destination_currency ~ '^[A-Z]{3}$'),
            calling_code VARCHAR(8),
            phone_min_digits SMALLINT,
            phone_max_digits SMALLINT,
            provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
            provider_country_code VARCHAR(8),
            status VARCHAR(20) NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','configuring','testing','active','disabled','legacy')),
            configuration_version INTEGER NOT NULL DEFAULT 1 CHECK (configuration_version > 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (
              (phone_min_digits IS NULL AND phone_max_digits IS NULL)
              OR (phone_min_digits BETWEEN 1 AND 15 AND phone_max_digits BETWEEN phone_min_digits AND 15)
            )
          );

          CREATE TABLE IF NOT EXISTS country_localizations (
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
            language_code VARCHAR(8) NOT NULL,
            display_name VARCHAR(120) NOT NULL,
            is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (country_code, language_code)
          );

          CREATE TABLE IF NOT EXISTS country_provider_mappings (
            country_code CHAR(2) PRIMARY KEY REFERENCES country_registry(country_code) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL,
            provider_country_code VARCHAR(8) NOT NULL,
            verified_at TIMESTAMPTZ,
            verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (verification_status IN ('pending','verified','rejected')),
            diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (provider, provider_country_code)
          );

          CREATE TABLE IF NOT EXISTS country_operators (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
            provider_operator_id VARCHAR(80) NOT NULL,
            operator_key VARCHAR(100) NOT NULL,
            display_name VARCHAR(120) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            verified_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (country_code, provider, provider_operator_id),
            UNIQUE (country_code, operator_key)
          );

          CREATE TABLE IF NOT EXISTS country_operator_prefixes (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
            operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE CASCADE,
            prefix VARCHAR(20) NOT NULL,
            priority SMALLINT NOT NULL DEFAULT 100,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE (country_code, prefix, operator_id)
          );
          CREATE INDEX IF NOT EXISTS idx_country_operator_prefix_lookup
            ON country_operator_prefixes(country_code, prefix) WHERE active = TRUE;

          CREATE TABLE IF NOT EXISTS country_products (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
            operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE CASCADE,
            provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
            provider_product_id VARCHAR(100) NOT NULL,
            denomination NUMERIC(18,4) NOT NULL CHECK (denomination > 0),
            destination_currency CHAR(3) NOT NULL,
            wholesale_amount NUMERIC(18,6),
            wholesale_currency CHAR(3),
            wholesale_eur_cents INTEGER,
            retail_eur_cents INTEGER,
            price_currency_verified BOOLEAN NOT NULL DEFAULT FALSE,
            verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (verification_status IN ('pending','verified','rejected')),
            catalog_status VARCHAR(20) NOT NULL DEFAULT 'disabled'
              CHECK (catalog_status IN ('disabled','review','active','retired')),
            provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            verified_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (provider, provider_product_id),
            CHECK (
              catalog_status <> 'active'
              OR (verification_status = 'verified' AND price_currency_verified = TRUE
                  AND wholesale_eur_cents > 0 AND retail_eur_cents > 0)
            )
          );
          CREATE INDEX IF NOT EXISTS idx_country_products_country_status
            ON country_products(country_code, catalog_status);

          CREATE TABLE IF NOT EXISTS country_fx_rates (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
            base_currency CHAR(3) NOT NULL DEFAULT 'EUR',
            quote_currency CHAR(3) NOT NULL,
            quote_per_base NUMERIC(20,8) NOT NULL CHECK (quote_per_base > 0),
            source VARCHAR(80) NOT NULL,
            source_reference TEXT,
            observed_at TIMESTAMPTZ NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            is_approved BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (base_currency = 'EUR'),
            CHECK (expires_at > observed_at)
          );
          CREATE INDEX IF NOT EXISTS idx_country_fx_rates_latest
            ON country_fx_rates(country_code, quote_currency, observed_at DESC);

          CREATE TABLE IF NOT EXISTS country_sync_runs (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) REFERENCES country_registry(country_code) ON DELETE SET NULL,
            provider VARCHAR(32) NOT NULL,
            run_type VARCHAR(32) NOT NULL,
            status VARCHAR(20) NOT NULL CHECK (status IN ('running','succeeded','partial','failed','cancelled')),
            pages_read INTEGER NOT NULL DEFAULT 0,
            items_seen INTEGER NOT NULL DEFAULT 0,
            items_verified INTEGER NOT NULL DEFAULT 0,
            items_rejected INTEGER NOT NULL DEFAULT 0,
            diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ
          );
          CREATE INDEX IF NOT EXISTS idx_country_sync_runs_country_time
            ON country_sync_runs(country_code, started_at DESC);

          CREATE TABLE IF NOT EXISTS country_activation_checks (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
            configuration_version INTEGER NOT NULL,
            check_name VARCHAR(80) NOT NULL,
            status VARCHAR(12) NOT NULL CHECK (status IN ('pass','warn','fail')),
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_country_activation_checks_latest
            ON country_activation_checks(country_code, configuration_version, checked_at DESC);

          CREATE TABLE IF NOT EXISTS country_configuration_audit (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE RESTRICT,
            actor VARCHAR(160) NOT NULL DEFAULT 'system',
            action VARCHAR(80) NOT NULL,
            configuration_version INTEGER NOT NULL,
            before_state JSONB,
            after_state JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_country_configuration_audit_country_time
            ON country_configuration_audit(country_code, created_at DESC);

          INSERT INTO country_registry
            (country_code,country_name,destination_currency,calling_code,phone_min_digits,phone_max_digits,provider,provider_country_code,status)
          VALUES
            ('AF','Afghanistan','AFN','+93',9,9,'dtone','AFG','legacy'),
            ('PK','Pakistan','PKR','+92',10,10,'dtone','PAK','legacy'),
            ('IN','India','INR','+91',10,10,'dtone','IND','legacy'),
            ('BD','Bangladesh','BDT','+880',10,10,'dtone','BGD','legacy')
          ON CONFLICT (country_code) DO NOTHING;

          INSERT INTO country_provider_mappings
            (country_code,provider,provider_country_code,verification_status)
          VALUES
            ('AF','dtone','AFG','pending'),
            ('PK','dtone','PAK','pending'),
            ('IN','dtone','IND','pending'),
            ('BD','dtone','BGD','pending')
          ON CONFLICT (country_code) DO NOTHING;

          INSERT INTO country_localizations (country_code,language_code,display_name)
          VALUES
            ('AF','ps','افغانستان'),('AF','fa','افغانستان'),('AF','en','Afghanistan'),('AF','ur','افغانستان'),('AF','hi','अफ़ग़ानिस्तान'),('AF','bn','আফগানিস্তান'),
            ('PK','ps','پاکستان'),('PK','fa','پاکستان'),('PK','en','Pakistan'),('PK','ur','پاکستان'),('PK','hi','पाकिस्तान'),('PK','bn','পাকিস্তান'),
            ('IN','ps','هند'),('IN','fa','هند'),('IN','en','India'),('IN','ur','بھارت'),('IN','hi','भारत'),('IN','bn','ভারত'),
            ('BD','ps','بنګله دېش'),('BD','fa','بنگلادش'),('BD','en','Bangladesh'),('BD','ur','بنگلہ دیش'),('BD','hi','बांग्लादेश'),('BD','bn','বাংলাদেশ')
          ON CONFLICT (country_code,language_code) DO NOTHING;

          INSERT INTO schema_migrations (version)
          VALUES ('017_dynamic_country_registry')
          ON CONFLICT (version) DO NOTHING;
        
COMMIT;
