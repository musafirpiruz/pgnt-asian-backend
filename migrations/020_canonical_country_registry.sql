-- Production migration 020: canonical country registry reconciliation.
-- Forward-only; conflicts abort the transaction and preserve source rows.
-- Run only after inspecting the target schema and rehearsing backup/restore.
-- This migration is deliberately conservative: conflicting country or operator
-- identities raise an exception and roll back instead of silently choosing a row.


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

CREATE TABLE IF NOT EXISTS country_operators (
  id BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
  provider_operator_id VARCHAR(80),
  operator_key VARCHAR(100) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, operator_key)
);

DO $$
DECLARE
  has_countries BOOLEAN;
  has_provider_settings BOOLEAN;
  conflict_count BIGINT;
  constraint_name TEXT;
  had_verified_at BOOLEAN;
  child_record RECORD;
BEGIN
  SELECT to_regclass(current_schema() || '.countries') IS NOT NULL INTO has_countries;
  SELECT to_regclass(current_schema() || '.country_provider_settings') IS NOT NULL INTO has_provider_settings;

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

    IF has_provider_settings THEN
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
    ELSE
      EXECUTE $q$
        INSERT INTO country_registry
          (country_code,country_name,destination_currency,calling_code,
           phone_min_digits,phone_max_digits,provider,status,created_at,updated_at)
        SELECT c.code,c.name_en,c.local_currency,c.calling_code,
               c.phone_min_digits,c.phone_max_digits,
               LOWER(COALESCE(NULLIF(c.provider_code,''),'dtone')),
               CASE WHEN c.status='active' THEN 'legacy'
                    WHEN c.status IN ('testing','disabled') THEN c.status
                    ELSE 'draft' END,
               c.created_at,c.updated_at
        FROM countries c
        ON CONFLICT (country_code) DO NOTHING
      $q$;
    END IF;
  END IF;

  -- Every canonical country must have an explicit provider code only when
  -- the source already contained one. Never infer a provider mapping here.
  IF to_regclass(current_schema() || '.country_operators') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='country_operators'
        AND column_name='verified_at'
    ) INTO had_verified_at;
    ALTER TABLE country_operators ADD COLUMN IF NOT EXISTS provider VARCHAR(32);
    ALTER TABLE country_operators ADD COLUMN IF NOT EXISTS provider_operator_id VARCHAR(80);
    ALTER TABLE country_operators ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    UPDATE country_operators
       SET provider=COALESCE(NULLIF(provider,''),'dtone'),
           active=CASE
             WHEN provider_operator_id IS NULL OR btrim(provider_operator_id)='' THEN FALSE
             WHEN NOT had_verified_at THEN FALSE
             WHEN verified_at IS NULL THEN FALSE
             ELSE active
           END;
    ALTER TABLE country_operators ALTER COLUMN provider SET DEFAULT 'dtone';
    ALTER TABLE country_operators ALTER COLUMN provider SET NOT NULL;
  END IF;

  -- Normalize operator translations to the operator_id contract used by
  -- the dynamic API. Keep legacy country_code/operator_key columns intact.
  CREATE TABLE IF NOT EXISTS country_operator_localizations (
    operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE CASCADE,
    language_code VARCHAR(8) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (operator_id, language_code)
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema()
      AND table_name='country_operator_localizations'
      AND column_name='country_code'
  ) THEN
    ALTER TABLE country_operator_localizations ADD COLUMN IF NOT EXISTS operator_id BIGINT;
    UPDATE country_operator_localizations l
       SET operator_id=o.id
      FROM country_operators o
     WHERE o.country_code=l.country_code
       AND o.operator_key=l.operator_key
       AND l.operator_id IS NULL;
    SELECT COUNT(*) INTO conflict_count
      FROM country_operator_localizations WHERE operator_id IS NULL;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'Cannot reconcile: % operator localization rows have no matching stable operator', conflict_count;
    END IF;
    ALTER TABLE country_operator_localizations ALTER COLUMN operator_id SET NOT NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid='country_operator_localizations'::regclass
        AND contype='f' AND conkey=ARRAY[
          (SELECT attnum FROM pg_attribute
           WHERE attrelid='country_operator_localizations'::regclass AND attname='operator_id')
        ]::smallint[]
    ) THEN
      ALTER TABLE country_operator_localizations
        ADD CONSTRAINT country_operator_localizations_operator_id_fk
        FOREIGN KEY (operator_id) REFERENCES country_operators(id) ON DELETE CASCADE;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS country_operator_localizations_operator_language_uidx
      ON country_operator_localizations(operator_id,language_code);
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

  -- Repoint every simple country_code -> countries(code) child FK, not
  -- just the two registry tables. PR #196 also has provider settings, FX
  -- rates and operator prefixes attached to the legacy parent.
  IF to_regclass(current_schema() || '.countries') IS NOT NULL THEN
    FOR child_record IN
      SELECT child.relname AS table_name,
             fk.conname AS constraint_name,
             pg_get_constraintdef(fk.oid) AS definition,
             fk.convalidated AS is_valid
      FROM pg_constraint fk
      JOIN pg_class child ON child.oid=fk.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
      JOIN pg_class parent ON parent.oid=fk.confrelid
      JOIN pg_attribute local_col ON local_col.attrelid=child.oid
        AND local_col.attnum=fk.conkey[1]
      JOIN pg_attribute parent_col ON parent_col.attrelid=parent.oid
        AND parent_col.attnum=fk.confkey[1]
      WHERE fk.contype='f'
        AND child_ns.nspname=current_schema()
        AND fk.confrelid='countries'::regclass
        AND array_length(fk.conkey,1)=1
        AND array_length(fk.confkey,1)=1
        AND local_col.attname='country_code'
        AND parent_col.attname='code'
    LOOP
      EXECUTE format(
        'SELECT COUNT(*) FROM %I child LEFT JOIN country_registry parent ON parent.country_code=child.country_code WHERE parent.country_code IS NULL',
        child_record.table_name
      ) INTO conflict_count;
      IF conflict_count > 0 THEN
        RAISE EXCEPTION 'Cannot reconcile %.%: % rows have no canonical country',
          child_record.table_name, child_record.constraint_name, conflict_count;
      END IF;
      -- Preserve the original FK actions, match mode and deferrability.
      -- Only the referenced parent/column changes; never silently turn a
      -- RESTRICT/NO ACTION relationship into ON DELETE CASCADE.
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',
        child_record.table_name, child_record.constraint_name);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I %s%s',
        child_record.table_name,
        child_record.constraint_name,
        replace(child_record.definition,
                'REFERENCES countries(code)',
                'REFERENCES country_registry(country_code)'),
        CASE WHEN child_record.is_valid THEN '' ELSE ' NOT VALID' END
      );
    END LOOP;
  END IF;

  -- The generic country_code FK loop above also migrates the two shared
  -- tables. Do not drop their other foreign keys: operator metadata and
  -- future relationships must remain intact.
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

