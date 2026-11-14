-- Verify migration 030 audit storage, constraints, and versioned snapshots.
BEGIN;
DO $$
DECLARE
  country_code_value CHAR(2);
  audit_id BIGINT;
  audit_count BIGINT;
BEGIN
  IF to_regclass('country_registry_audit') IS NULL THEN
    RAISE EXCEPTION 'country_registry_audit table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
     WHERE version='030_country_registry_audit_trail'
  ) THEN
    RAISE EXCEPTION 'migration 030 version is not registered';
  END IF;
  SELECT country_code INTO country_code_value
    FROM country_registry ORDER BY country_code LIMIT 1;
  IF country_code_value IS NULL THEN
    RAISE EXCEPTION 'country registry fixture is missing';
  END IF;
  INSERT INTO country_registry_audit
    (country_code,actor,action,previous_version,new_version,old_values,new_values)
  VALUES
    (country_code_value,'ci-test','configuration_updated',1,2,
     '{"status":"legacy"}'::jsonb,'{"status":"configuring"}'::jsonb)
  RETURNING id INTO audit_id;
  SELECT COUNT(*) INTO audit_count FROM country_registry_audit WHERE id=audit_id;
  IF audit_count <> 1 THEN
    RAISE EXCEPTION 'audit row was not persisted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE indexname='country_registry_audit_country_created_idx'
  ) THEN
    RAISE EXCEPTION 'country audit index is missing';
  END IF;
END $$;
ROLLBACK;
