-- Exercise migration 013 against a legacy refunds table without its order uniqueness constraint.
DO $test$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'refunds'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (order_id)'
  LOOP
    EXECUTE format('ALTER TABLE refunds DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$test$;

DELETE FROM schema_migrations
WHERE version = '013_refund_order_uniqueness';
