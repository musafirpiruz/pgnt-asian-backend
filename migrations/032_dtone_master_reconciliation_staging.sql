BEGIN;

CREATE TABLE IF NOT EXISTS dtone_master_reconciliation_runs (
  id UUID PRIMARY KEY,
  source_file_name TEXT NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  api_origin TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  report_version INTEGER NOT NULL DEFAULT 1 CHECK (report_version = 1),
  total_products INTEGER NOT NULL CHECK (total_products = 1960),
  country_counts JSONB NOT NULL,
  product_type_counts JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed')),
  resume_after TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dtone_master_reconciliation_runs ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE dtone_master_reconciliation_runs ADD COLUMN IF NOT EXISTS api_origin TEXT;

CREATE TABLE IF NOT EXISTS dtone_master_reconciliation_items (
  run_id UUID NOT NULL
    REFERENCES dtone_master_reconciliation_runs(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL CHECK (product_id ~ '^[0-9]+$'),
  country_code CHAR(2) NOT NULL CHECK (country_code IN ('AF', 'PK', 'IN', 'BD')),
  expected JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'matched', 'mismatch', 'missing_at_provider', 'lookup_error')),
  provider JSONB,
  differences JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(differences) = 'array'),
  provider_http_status INTEGER,
  last_error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  checked_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_dtone_master_reconciliation_items_pending
  ON dtone_master_reconciliation_items (run_id, status, product_id);

CREATE INDEX IF NOT EXISTS idx_dtone_master_reconciliation_runs_status
  ON dtone_master_reconciliation_runs (status, created_at);

COMMENT ON TABLE dtone_master_reconciliation_runs IS
  'Versioned DT One master workbook verification runs. This is report metadata only; it does not import or activate product_catalog rows.';

COMMENT ON TABLE dtone_master_reconciliation_items IS
  'Expected workbook snapshots and read-only DT One verification outcomes only. These staging rows are not customer catalog products and are never used for checkout.';

COMMIT;
