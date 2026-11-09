BEGIN;

          CREATE TABLE IF NOT EXISTS countries (
            code CHAR(2) PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z]$'),
            name_en TEXT NOT NULL,
            local_currency CHAR(3) NOT NULL CHECK (local_currency ~ '^[A-Z][A-Z][A-Z]$'),
            calling_code VARCHAR(8),
            phone_min_digits SMALLINT CHECK (phone_min_digits IS NULL OR phone_min_digits BETWEEN 4 AND 15),
            phone_max_digits SMALLINT CHECK (phone_max_digits IS NULL OR phone_max_digits BETWEEN 4 AND 15),
            provider_code TEXT,
            status TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','testing','active','disabled')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (phone_min_digits IS NULL OR phone_max_digits IS NULL OR phone_min_digits <= phone_max_digits)
          );

          CREATE TABLE IF NOT EXISTS country_localizations (
            country_code CHAR(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
            language_code VARCHAR(8) NOT NULL,
            display_name TEXT NOT NULL,
            is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (country_code, language_code)
          );

          CREATE TABLE IF NOT EXISTS country_operators (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
            operator_key TEXT NOT NULL,
            display_name TEXT NOT NULL,
            provider_operator_id TEXT,
            active BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (country_code, operator_key)
          );

          CREATE TABLE IF NOT EXISTS country_operator_localizations (
            country_code CHAR(2) NOT NULL,
            operator_key TEXT NOT NULL,
            language_code VARCHAR(8) NOT NULL,
            display_name TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (country_code, operator_key, language_code),
            FOREIGN KEY (country_code, operator_key)
              REFERENCES country_operators(country_code, operator_key) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS operator_prefixes (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
            operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE CASCADE,
            prefix VARCHAR(20) NOT NULL,
            priority SMALLINT NOT NULL DEFAULT 100,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (country_code, prefix, operator_id)
          );

          CREATE TABLE IF NOT EXISTS country_exchange_rates (
            id BIGSERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
            base_currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (base_currency = 'EUR'),
            quote_currency CHAR(3) NOT NULL,
            rate NUMERIC(20,8) NOT NULL CHECK (rate > 0),
            source TEXT NOT NULL,
            observed_at TIMESTAMPTZ NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_reference_only BOOLEAN NOT NULL DEFAULT TRUE,
            UNIQUE (country_code, source, observed_at)
          );
          CREATE INDEX IF NOT EXISTS idx_country_exchange_rates_latest
            ON country_exchange_rates(country_code, fetched_at DESC);

          CREATE TABLE IF NOT EXISTS country_provider_settings (
            country_code CHAR(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
            provider_code TEXT NOT NULL,
            provider_country_code TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (country_code, provider_code)
          );

          INSERT INTO countries
            (code, name_en, local_currency, calling_code, phone_min_digits, phone_max_digits, provider_code, status)
          VALUES
            ('AF','Afghanistan','AFN','+93',9,9,'DTONE','active'),
            ('PK','Pakistan','PKR','+92',10,10,'DTONE','active'),
            ('IN','India','INR','+91',10,10,'DTONE','active'),
            ('BD','Bangladesh','BDT','+880',10,10,'DTONE','active')
          ON CONFLICT (code) DO NOTHING;

          INSERT INTO country_localizations(country_code, language_code, display_name, is_fallback)
          VALUES
            ('AF','en','Afghanistan',FALSE),
            ('AF','ps','افغانستان',FALSE),
            ('AF','fa','افغانستان',FALSE),
            ('AF','ur','افغانستان',FALSE),
            ('AF','hi','अफ़ग़ानिस्तान',FALSE),
            ('AF','bn','আফগানিস্তান',FALSE),
            ('PK','en','Pakistan',FALSE),
            ('PK','ps','پاکستان',FALSE),
            ('PK','fa','پاکستان',FALSE),
            ('PK','ur','پاکستان',FALSE),
            ('PK','hi','पाकिस्तान',FALSE),
            ('PK','bn','পাকিস্তান',FALSE),
            ('IN','en','India',FALSE),
            ('IN','ps','هند',FALSE),
            ('IN','fa','هند',FALSE),
            ('IN','ur','بھارت',FALSE),
            ('IN','hi','भारत',FALSE),
            ('IN','bn','ভারত',FALSE),
            ('BD','en','Bangladesh',FALSE),
            ('BD','ps','بنګله‌دېش',FALSE),
            ('BD','fa','بنگلادیش',FALSE),
            ('BD','ur','بنگلہ دیش',FALSE),
            ('BD','hi','बांग्लादेश',FALSE),
            ('BD','bn','বাংলাদেশ',FALSE)
          ON CONFLICT (country_code, language_code) DO NOTHING;

          INSERT INTO country_provider_settings(country_code, provider_code, provider_country_code, enabled)
          VALUES
            ('AF','DTONE','AFG',TRUE),
            ('PK','DTONE','PAK',TRUE),
            ('IN','DTONE','IND',TRUE),
            ('BD','DTONE','BGD',TRUE)
          ON CONFLICT (country_code, provider_code) DO NOTHING;

          INSERT INTO schema_migrations(version)
          VALUES ('017_database_country_registry')
          ON CONFLICT (version) DO NOTHING;
        
COMMIT;
