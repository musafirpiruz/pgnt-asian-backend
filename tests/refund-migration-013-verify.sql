DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'refunds'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (order_id)'
  ) THEN
    RAISE EXCEPTION 'Migration 013 failed to restore UNIQUE(order_id) on refunds';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '013_refund_order_uniqueness'
  ) THEN
    RAISE EXCEPTION 'Migration 013 did not record its version';
  END IF;
END
$test$;
