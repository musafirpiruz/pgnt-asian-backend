-- =========================================================
-- PGNT ASIAN TOPUP
-- DATABASE SCHEMA
-- PART 1 / 3
-- =========================================================

-- =========================================================
-- 1. PRICING SETTINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS pricing_settings (
  country CHAR(2) PRIMARY KEY,
  fee_eur_cents INTEGER NOT NULL DEFAULT 79
    CHECK (fee_eur_cents >= 0),
  bonus_percent NUMERIC(8,2) NOT NULL DEFAULT 0
    CHECK (bonus_percent >= 0 AND bonus_percent <= 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safety: if an older table already exists, make sure
-- the required columns are present.
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS fee_eur_cents INTEGER NOT NULL DEFAULT 79;

ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS bonus_percent NUMERIC(8,2) NOT NULL DEFAULT 0;

ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- =========================================================
-- 2. PRODUCT CATALOG
-- =========================================================

CREATE TABLE IF NOT EXISTS product_catalog (
  id BIGSERIAL PRIMARY KEY,
  country CHAR(2) NOT NULL,
  operator VARCHAR(120) NOT NULL,
  amount NUMERIC(18,2) NOT NULL
    CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  product_id BIGINT NOT NULL UNIQUE,
  price_eur_cents INTEGER NOT NULL
    CHECK (price_eur_cents > 0),
  bonus_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country, operator, amount, currency)
);

-- Safety for an older product_catalog table.
ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS country CHAR(2);

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS operator VARCHAR(120);

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS currency CHAR(3);

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS product_id BIGINT;

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS price_eur_cents INTEGER;

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(18,2) DEFAULT 0;

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE product_catalog
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- =========================================================
-- 3. PRODUCT CATALOG INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_product_catalog_country
ON product_catalog (country, active);

CREATE INDEX IF NOT EXISTS idx_product_catalog_operator
ON product_catalog (operator);


-- =========================================================
-- 4. ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,

  order_id VARCHAR(80) NOT NULL UNIQUE,

  country CHAR(2) NOT NULL,
  operator VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL,

  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,

  product_id BIGINT NOT NULL,
  product_price_cents INTEGER NOT NULL,

  fee_cents INTEGER NOT NULL DEFAULT 0,

  bonus_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  charge_cents INTEGER NOT NULL,

  status VARCHAR(40) NOT NULL DEFAULT 'pending',

  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),

  dtone_transaction_id VARCHAR(255),
  dtone_status VARCHAR(80),
  dtone_error TEXT,
  dtone_callback_payload JSONB,

  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 5. SAFETY COLUMNS FOR ORDERS
-- =========================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_id VARCHAR(80);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS country CHAR(2);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS operator VARCHAR(120);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency CHAR(3);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS product_id BIGINT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS product_price_cents INTEGER;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fee_cents INTEGER DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(18,2) DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS charge_cents INTEGER;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'pending';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dtone_transaction_id VARCHAR(255);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dtone_status VARCHAR(80);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dtone_error TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dtone_callback_payload JSONB;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- =========================================================
-- 6. ORDER INDEXES
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session
ON orders (stripe_session_id)
WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_phone
ON orders (phone);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
ON orders (created_at DESC);


-- =========================================================
-- 7. STRIPE / WEBHOOK EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,

  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(255) NOT NULL,

  payload JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
ON webhook_events (provider, created_at DESC);


-- =========================================================
-- 8. REFUNDS
-- =========================================================

CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,

  order_id VARCHAR(80) NOT NULL
    REFERENCES orders(order_id),

  stripe_refund_id VARCHAR(255),

  amount_cents INTEGER NOT NULL,

  status VARCHAR(50) NOT NULL,

  reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id
ON refunds (order_id);

CREATE INDEX IF NOT EXISTS idx_refunds_status
ON refunds (status);


-- =========================================================
-- END OF PART 1 / 3
-- =========================================================
-- =========================================================
-- PGNT ASIAN TOPUP
-- DATABASE SCHEMA
-- PART 2 / 3
-- =========================================================


-- =========================================================
-- 9. USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,

  phone VARCHAR(40),
  email VARCHAR(255),

  full_name VARCHAR(160),

  language VARCHAR(20) NOT NULL DEFAULT 'en',

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Safety columns for older users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(160);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'en';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- =========================================================
-- 10. USER INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_users_phone
ON users (phone);

CREATE INDEX IF NOT EXISTS idx_users_email
ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_active
ON users (is_active);


-- =========================================================
-- 11. WALLETS
-- =========================================================

CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,

  user_id BIGINT NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  currency CHAR(3) NOT NULL DEFAULT 'EUR',

  balance_cents BIGINT NOT NULL DEFAULT 0
    CHECK (balance_cents >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, currency)
);


-- =========================================================
-- 12. WALLET TRANSACTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGSERIAL PRIMARY KEY,

  wallet_id BIGINT NOT NULL
    REFERENCES wallets(id)
    ON DELETE CASCADE,

  type VARCHAR(40) NOT NULL,

  amount_cents BIGINT NOT NULL,

  balance_before_cents BIGINT NOT NULL DEFAULT 0,

  balance_after_cents BIGINT NOT NULL DEFAULT 0,

  reference_type VARCHAR(50),

  reference_id VARCHAR(255),

  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 13. WALLET INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_wallets_user
ON wallets (user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet
ON wallet_transactions (wallet_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference
ON wallet_transactions (reference_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created
ON wallet_transactions (created_at DESC);


-- =========================================================
-- 14. SUPPORT TICKETS
-- =========================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,

  user_id BIGINT
    REFERENCES users(id)
    ON DELETE SET NULL,

  order_id VARCHAR(80)
    REFERENCES orders(order_id)
    ON DELETE SET NULL,

  subject VARCHAR(255) NOT NULL,

  message TEXT NOT NULL,

  status VARCHAR(40) NOT NULL DEFAULT 'open',

  priority VARCHAR(30) NOT NULL DEFAULT 'normal',

  category VARCHAR(60),

  admin_reply TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 15. SUPPORT INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
ON support_tickets (user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_order
ON support_tickets (order_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
ON support_tickets (status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created
ON support_tickets (created_at DESC);


-- =========================================================
-- 16. DEFAULT PRICING
-- =========================================================

INSERT INTO pricing_settings
  (country, fee_eur_cents, bonus_percent, active)
VALUES
  ('AF', 79, 2.00, TRUE),
  ('PK', 79, 2.00, TRUE),
  ('IN', 79, 2.00, TRUE),
  ('BD', 79, 2.00, TRUE)
ON CONFLICT (country) DO NOTHING;


-- =========================================================
-- 17. DT ONE PRODUCT PLACEHOLDERS
-- =========================================================
--
-- IMPORTANT:
-- These are NOT real DT One production products.
-- They remain DISABLED until real DT One Sandbox
-- product IDs are verified.
--

INSERT INTO product_catalog
  (
    country,
    operator,
    amount,
    currency,
    product_id,
    price_eur_cents,
    bonus_amount,
    active
  )
VALUES
  ('AF', 'Roshan',     100,  'AFN', 900001, 164,  0, FALSE),
  ('AF', 'Etisalat',   100,  'AFN', 900002, 164,  0, FALSE),
  ('PK', 'Jazz',       100,  'PKR', 900003, 250,  0, FALSE),
  ('IN', 'Airtel',    100,  'INR', 900004, 120,  0, FALSE)
ON CONFLICT (country, operator, amount, currency)
DO NOTHING;


-- =========================================================
-- 18. FINAL SAFETY INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_dtone_transaction
ON orders (dtone_transaction_id);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment
ON orders (stripe_payment_intent_id);


-- =========================================================
-- END OF PART 2 / 3
-- =========================================================
-- =========================================================
-- PGNT ASIAN TOPUP
-- DATABASE SCHEMA
-- PART 3 / 3
-- =========================================================


-- =========================================================
-- 19. FINAL SAFETY CHECKS
-- =========================================================

-- Make sure old/partial databases do not use
-- the wrong "enabled" column.
--
-- PGNT ASIAN TOPUP uses:
--     product_catalog.active
--
-- NOT:
--     product_catalog.enabled
--


-- =========================================================
-- 20. NORMALIZE NULL DEFAULT VALUES
-- =========================================================

UPDATE pricing_settings
SET
  fee_eur_cents = COALESCE(fee_eur_cents, 79),
  bonus_percent = COALESCE(bonus_percent, 0),
  active = COALESCE(active, TRUE),
  updated_at = COALESCE(updated_at, NOW())
WHERE fee_eur_cents IS NULL
   OR bonus_percent IS NULL
   OR active IS NULL
   OR updated_at IS NULL;


UPDATE product_catalog
SET
  bonus_amount = COALESCE(bonus_amount, 0),
  active = COALESCE(active, FALSE),
  updated_at = COALESCE(updated_at, NOW())
WHERE bonus_amount IS NULL
   OR active IS NULL
   OR updated_at IS NULL;


UPDATE orders
SET
  fee_cents = COALESCE(fee_cents, 0),
  bonus_amount = COALESCE(bonus_amount, 0),
  status = COALESCE(status, 'pending'),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE fee_cents IS NULL
   OR bonus_amount IS NULL
   OR status IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;


-- =========================================================
-- 21. FINAL INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_product_catalog_active
ON product_catalog (active);

CREATE INDEX IF NOT EXISTS idx_product_catalog_country_currency
ON product_catalog (country, currency);

CREATE INDEX IF NOT EXISTS idx_orders_country
ON orders (country);

CREATE INDEX IF NOT EXISTS idx_orders_dtone_status
ON orders (dtone_status);

CREATE INDEX IF NOT EXISTS idx_orders_paid_at
ON orders (paid_at DESC);


-- =========================================================
-- 22. UPDATED-AT HELPER FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION pgnt_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =========================================================
-- 23. UPDATED-AT TRIGGERS
-- =========================================================

DROP TRIGGER IF EXISTS trg_pricing_settings_updated
ON pricing_settings;

CREATE TRIGGER trg_pricing_settings_updated
BEFORE UPDATE ON pricing_settings
FOR EACH ROW
EXECUTE FUNCTION pgnt_set_updated_at();


DROP TRIGGER IF EXISTS trg_product_catalog_updated
ON product_catalog;

CREATE TRIGGER trg_product_catalog_updated
BEFORE UPDATE ON product_catalog
FOR EACH ROW
EXECUTE FUNCTION pgnt_set_updated_at();


DROP TRIGGER IF EXISTS trg_orders_updated
ON orders;

CREATE TRIGGER trg_orders_updated
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION pgnt_set_updated_at();


DROP TRIGGER IF EXISTS trg_users_updated
ON users;

CREATE TRIGGER trg_users_updated
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION pgnt_set_updated_at();


DROP TRIGGER IF EXISTS trg_wallets_updated
ON wallets;

CREATE TRIGGER trg_wallets_updated
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION pgnt_set_updated_at();


DROP TRIGGER IF EXISTS trg_support_tickets_updated
ON support_tickets;

CREATE TRIGGER trg_support_tickets_updated
BEFORE UPDATE ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION pgnt_set_updated_at();


-- =========================================================
-- 24. FINAL DATABASE VERIFICATION
-- =========================================================

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'pricing_settings'
  ) THEN
    RAISE EXCEPTION 'pricing_settings table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'product_catalog'
  ) THEN
    RAISE EXCEPTION 'product_catalog table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'orders'
  ) THEN
    RAISE EXCEPTION 'orders table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'webhook_events'
  ) THEN
    RAISE EXCEPTION 'webhook_events table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'refunds'
  ) THEN
    RAISE EXCEPTION 'refunds table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'users table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'wallets'
  ) THEN
    RAISE EXCEPTION 'wallets table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'wallet_transactions'
  ) THEN
    RAISE EXCEPTION 'wallet_transactions table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'support_tickets'
  ) THEN
    RAISE EXCEPTION 'support_tickets table is missing';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'product_catalog'
      AND column_name = 'active'
  ) THEN
    RAISE EXCEPTION 'product_catalog.active column is missing';
  END IF;


  RAISE NOTICE '==============================================';
  RAISE NOTICE 'PGNT ASIAN TOPUP DATABASE VERIFICATION PASSED';
  RAISE NOTICE 'All required tables and catalog.active exist.';
  RAISE NOTICE '==============================================';

END
$$;


-- =========================================================
-- END OF PART 3 / 3
-- =========================================================
