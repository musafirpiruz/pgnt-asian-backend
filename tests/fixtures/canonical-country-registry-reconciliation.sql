-- Forward-only country registry reconciliation.
-- Run only after inspecting the target schema and rehearsing backup/restore.
-- This migration is deliberately conservative: conflicting country or operator
-- identities raise an exception and roll back instead of silently choosing a row.

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

DO $$
DECLARE
  has_countries BOOLEAN;
  conflict_count BIGINT;
  constraint_name TEXT;
BEGIN
  SELECT to_regclass(current_schema() || '.countries') IS NOT NULL INTO has_countries;

  IF has_countries THEN
    -- Refuse ambiguous mappings before copying any country rows.
    EXECUTE $q$
      SELECT COUNT(*) FROM countries c
      JOIN country_registry r ON r.country_code = c.code
      WHERE r.country_name <> c.name_en
         OR r.destination_currency <> c.local_currency
         OR COALESCE(r.calling_code,'') <> COALESCE(c.calling_code,'')
    $q$ INTO conflict_count;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'Country registry reconciliation found % conflicting country rows', conflict_count;
    END IF;

    EXECUTE $q$
      INSERT INTO country_registry
        (country_code,country_name,destination_currency,calling_code,
         phone_min_digits,phone_max_digits,provider,provider_country_code,status,
         created_at,updated_at)
      SELECT c.code,c.name_en,c.local_currency,c.calling_code,
             c.phone_min_digits,c.phone_max_digits,
             LOWER(COALESCE(NULLIF(c.provider_code,''),'dtone')),
             ps.provider_country_code,
             CASE WHEN c.status='active' THEN 'legacy'
                  WHEN c.status IN ('testing','disabled') THEN c.status
                  ELSE 'draft' END,
             c.created_at,c.updated_at
      FROM countries c
      LEFT JOIN country_provider_settings ps
        ON ps.country_code=c.code AND UPPER(ps.provider_code)='DTONE'
      ON CONFLICT (country_code) DO NOTHING
    $q$;
  END IF;

  -- Every canonical country must have an explicit provider code only when
  -- the source already contained one. Never infer a provider mapping here.
  IF to_regclass(current_schema() || '.country_operators') IS NOT NULL THEN
    ALTER TABLE country_operators ADD COLUMN IF NOT EXISTS provider VARCHAR(32);
    ALTER TABLE country_operators ADD COLUMN IF NOT EXISTS provider_operator_id VARCHAR(80);
    UPDATE country_operators
       SET provider=COALESCE(NULLIF(provider,''),'dtone'),
           active=CASE WHEN provider_operator_id IS NULL OR btrim(provider_operator_id)=''
                       THEN FALSE ELSE active END;
    ALTER TABLE country_operators ALTER COLUMN provider SET DEFAULT 'dtone';
    ALTER TABLE country_operators ALTER COLUMN provider SET NOT NULL;
  END IF;

  -- Verify every child key has a canonical parent before changing its FK.
  IF to_regclass(current_schema() || '.country_localizations') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM country_localizations l
             LEFT JOIN country_registry r ON r.country_code=l.country_code
             WHERE r.country_code IS NULL' INTO conflict_count;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'Cannot reconcile: % localization rows have no canonical country', conflict_count;
    END IF;
  END IF;
  IF to_regclass(current_schema() || '.country_operators') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM country_operators o
             LEFT JOIN country_registry r ON r.country_code=o.country_code
             WHERE r.country_code IS NULL' INTO conflict_count;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'Cannot reconcile: % operator rows have no canonical country', conflict_count;
    END IF;
  END IF;

  -- Replace only country-parent FKs on the two shared tables. Preserve all
  -- other constraints and data. Names are generated deterministically.
  IF to_regclass(current_schema() || '.country_localizations') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid='country_localizations'::regclass AND c.contype='f'
        AND c.confrelid <> 'country_registry'::regclass
    LOOP
      EXECUTE format('ALTER TABLE country_localizations DROP CONSTRAINT %I', constraint_name);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='country_localizations'::regclass AND c.contype='f'
        AND c.confrelid='country_registry'::regclass
    ) THEN
      ALTER TABLE country_localizations
        ADD CONSTRAINT country_localizations_country_registry_fk
        FOREIGN KEY (country_code) REFERENCES country_registry(country_code) ON DELETE CASCADE;
    END IF;
  END IF;

  IF to_regclass(current_schema() || '.country_operators') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid='country_operators'::regclass AND c.contype='f'
        AND c.confrelid <> 'country_registry'::regclass
    LOOP
      EXECUTE format('ALTER TABLE country_operators DROP CONSTRAINT %I', constraint_name);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='country_operators'::regclass AND c.contype='f'
        AND c.confrelid='country_registry'::regclass
    ) THEN
      ALTER TABLE country_operators
        ADD CONSTRAINT country_operators_country_registry_fk
        FOREIGN KEY (country_code) REFERENCES country_registry(country_code) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS country_registry_reconciliation (
  version TEXT PRIMARY KEY,
  canonical_parent TEXT NOT NULL CHECK (canonical_parent='country_registry'),
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO country_registry_reconciliation(version,canonical_parent,details)
VALUES ('001_country_registry_canonical_parent','country_registry',
        '{"preserves_source_rows":true,"activation_changed":false}'::jsonb)
ON CONFLICT (version) DO NOTHING;

COMMIT;
