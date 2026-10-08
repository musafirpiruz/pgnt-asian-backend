-- ============================================================
-- PGNT ASIAN TOPUP
-- DATABASE SCHEMA
-- PART 1
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- PRICING SETTINGS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pricing_settings (
    country VARCHAR(2) PRIMARY KEY,

    currency VARCHAR(3) NOT NULL,

    fee_eur_cents INTEGER NOT NULL DEFAULT 0,

    bonus_percent NUMERIC(8,2) NOT NULL DEFAULT 0,

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_country_check
        CHECK (country IN ('AF', 'PK', 'IN', 'BD')),

    CONSTRAINT pricing_fee_check
        CHECK (fee_eur_cents >= 0),

    CONSTRAINT pricing_bonus_check
        CHECK (
            bonus_percent >= 0
            AND bonus_percent <= 100
        )
);

-- ------------------------------------------------------------
-- PRODUCT CATALOG
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_catalog (
    id BIGSERIAL PRIMARY KEY,

    country VARCHAR(2) NOT NULL,

    currency VARCHAR(3) NOT NULL,

    dtone_product_id BIGINT NOT NULL,

    name VARCHAR(150) NOT NULL,

    description TEXT,

    local_amount NUMERIC(18,2) NOT NULL,

    price_eur_cents INTEGER NOT NULL,

    bonus_percent NUMERIC(8,2),

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT product_country_check
        CHECK (country IN ('AF', 'PK', 'IN', 'BD')),

    CONSTRAINT product_local_amount_check
        CHECK (local_amount > 0),

    CONSTRAINT product_price_check
        CHECK (price_eur_cents > 0),

    CONSTRAINT product_bonus_check
        CHECK (
            bonus_percent IS NULL
            OR (
                bonus_percent >= 0
                AND bonus_percent <= 100
            )
        )
);

CREATE INDEX IF NOT EXISTS
    idx_product_catalog_country
ON product_catalog(country);

CREATE INDEX IF NOT EXISTS
    idx_product_catalog_enabled
ON product_catalog(enabled);

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_product_catalog_dtone_product
ON product_catalog(dtone_product_id);

-- ------------------------------------------------------------
-- ORDERS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,

    order_id VARCHAR(80) NOT NULL UNIQUE,

    country VARCHAR(2) NOT NULL,

    currency VARCHAR(3) NOT NULL,

    phone VARCHAR(40) NOT NULL,

    product_id BIGINT,

    dtone_product_id BIGINT,

    local_amount NUMERIC(18,2),

    base_price_eur_cents INTEGER NOT NULL,

    fee_eur_cents INTEGER NOT NULL DEFAULT 0,

    bonus_percent NUMERIC(8,2) NOT NULL DEFAULT 0,

    bonus_amount_eur_cents INTEGER NOT NULL DEFAULT 0,

    final_price_eur_cents INTEGER NOT NULL,

    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',

    status VARCHAR(30) NOT NULL DEFAULT 'created',

    stripe_session_id VARCHAR(255),

    stripe_payment_intent_id VARCHAR(255),

    dtone_transaction_id VARCHAR(255),

    dtone_status VARCHAR(100),

    dtone_response JSONB,

    last_error TEXT,

    refund_status VARCHAR(30),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    paid_at TIMESTAMPTZ,

    refunded_at TIMESTAMPTZ,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT orders_country_check
        CHECK (country IN ('AF', 'PK', 'IN', 'BD')),

    CONSTRAINT orders_price_check
        CHECK (final_price_eur_cents >= 0)
);

CREATE INDEX IF NOT EXISTS
    idx_orders_order_id
ON orders(order_id);

CREATE INDEX IF NOT EXISTS
    idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS
    idx_orders_payment_status
ON orders(payment_status);

CREATE INDEX IF NOT EXISTS
    idx_orders_stripe_session
ON orders(stripe_session_id);

CREATE INDEX IF NOT EXISTS
    idx_orders_dtone_transaction
ON orders(dtone_transaction_id);

CREATE INDEX IF NOT EXISTS
    idx_orders_created_at
ON orders(created_at DESC);
-- ============================================================
-- PGNT ASIAN TOPUP
-- DATABASE SCHEMA
-- PART 2
-- ============================================================

-- ------------------------------------------------------------
-- STRIPE / DT ONE WEBHOOK EVENTS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGSERIAL PRIMARY KEY,

    provider VARCHAR(30) NOT NULL,

    event_id VARCHAR(255) NOT NULL,

    event_type VARCHAR(150),

    payload JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT webhook_provider_check
        CHECK (provider IN ('stripe', 'dtone')),

    CONSTRAINT webhook_event_unique
        UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS
    idx_webhook_events_provider
ON webhook_events(provider);

CREATE INDEX IF NOT EXISTS
    idx_webhook_events_created
ON webhook_events(created_at DESC);


-- ------------------------------------------------------------
-- REFUNDS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refunds (
    id BIGSERIAL PRIMARY KEY,

    order_id VARCHAR(80) NOT NULL,

    stripe_refund_id VARCHAR(255),

    amount_eur_cents INTEGER NOT NULL DEFAULT 0,

    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_refunds_order_id
ON refunds(order_id);

CREATE INDEX IF NOT EXISTS
    idx_refunds_status
ON refunds(status);


-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,

    email VARCHAR(255) UNIQUE,

    phone VARCHAR(40),

    display_name VARCHAR(150),

    preferred_language VARCHAR(10)
        NOT NULL DEFAULT 'en',

    preferred_country VARCHAR(2),

    referral_code VARCHAR(50) UNIQUE,

    referred_by VARCHAR(50),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_users_email
ON users(email);

CREATE INDEX IF NOT EXISTS
    idx_users_phone
ON users(phone);

CREATE INDEX IF NOT EXISTS
    idx_users_referral_code
ON users(referral_code);


-- ------------------------------------------------------------
-- WALLETS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wallets (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL UNIQUE,

    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

    balance_eur_cents BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT wallet_balance_check
        CHECK (balance_eur_cents >= 0)
);

CREATE INDEX IF NOT EXISTS
    idx_wallets_user_id
ON wallets(user_id);


-- ------------------------------------------------------------
-- WALLET TRANSACTIONS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL,

    wallet_id BIGINT NOT NULL,

    type VARCHAR(40) NOT NULL,

    amount_eur_cents BIGINT NOT NULL,

    balance_after_eur_cents BIGINT NOT NULL,

    reference_type VARCHAR(50),

    reference_id VARCHAR(255),

    description TEXT,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_wallet_transactions_user
ON wallet_transactions(user_id);

CREATE INDEX IF NOT EXISTS
    idx_wallet_transactions_wallet
ON wallet_transactions(wallet_id);

CREATE INDEX IF NOT EXISTS
    idx_wallet_transactions_created
ON wallet_transactions(created_at DESC);


-- ------------------------------------------------------------
-- SUPPORT TICKETS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGSERIAL PRIMARY KEY,

    ticket_id VARCHAR(80) NOT NULL UNIQUE,

    user_id BIGINT,

    order_id VARCHAR(80),

    category VARCHAR(50),

    subject VARCHAR(255) NOT NULL,

    message TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'open',

    priority VARCHAR(20) NOT NULL DEFAULT 'normal',

    admin_reply TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_support_tickets_user
ON support_tickets(user_id);

CREATE INDEX IF NOT EXISTS
    idx_support_tickets_order
ON support_tickets(order_id);

CREATE INDEX IF NOT EXISTS
    idx_support_tickets_status
ON support_tickets(status);

CREATE INDEX IF NOT EXISTS
    idx_support_tickets_created
ON support_tickets(created_at DESC);


-- ------------------------------------------------------------
-- DEFAULT PRICING
-- ------------------------------------------------------------

INSERT INTO pricing_settings (
    country,
    currency,
    fee_eur_cents,
    bonus_percent,
    enabled
)
VALUES
    ('AF', 'AFN', 79, 2.00, TRUE),
    ('PK', 'PKR', 79, 2.00, TRUE),
    ('IN', 'INR', 79, 2.00, TRUE),
    ('BD', 'BDT', 79, 2.00, TRUE)
ON CONFLICT (country)
DO UPDATE SET
    currency = EXCLUDED.currency,
    fee_eur_cents = EXCLUDED.fee_eur_cents,
    bonus_percent = EXCLUDED.bonus_percent,
    enabled = EXCLUDED.enabled,
    updated_at = NOW();

COMMIT;
-- ============================================================
-- PGNT ASIAN TOPUP
-- DATABASE SCHEMA
-- PART 3
-- DT ONE PRODUCT CATALOG PREPARATION
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- PRODUCT CATALOG VALIDATION INDEXES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS
    idx_product_catalog_country_currency
ON product_catalog(country, currency);

CREATE INDEX IF NOT EXISTS
    idx_product_catalog_price
ON product_catalog(price_eur_cents);

-- ------------------------------------------------------------
-- SAFE SAMPLE PRODUCTS
-- ------------------------------------------------------------
-- IMPORTANT:
-- These are DISABLED examples only.
-- Replace them with REAL DT One Sandbox Product IDs
-- before enabling any product.
-- ------------------------------------------------------------

INSERT INTO product_catalog (
    country,
    currency,
    dtone_product_id,
    name,
    description,
    local_amount,
    price_eur_cents,
    bonus_percent,
    enabled
)
VALUES
(
    'AF',
    'AFN',
    900001,
    'Afghanistan Top Up - TEST',
    'Disabled sandbox placeholder. Replace with real DT One product ID.',
    100,
    164,
    NULL,
    FALSE
),
(
    'PK',
    'PKR',
    900002,
    'Pakistan Top Up - TEST',
    'Disabled sandbox placeholder. Replace with real DT One product ID.',
    100,
    150,
    NULL,
    FALSE
),
(
    'IN',
    'INR',
    900003,
    'India Top Up - TEST',
    'Disabled sandbox placeholder. Replace with real DT One product ID.',
    100,
    120,
    NULL,
    FALSE
),
(
    'BD',
    'BDT',
    900004,
    'Bangladesh Top Up - TEST',
    'Disabled sandbox placeholder. Replace with real DT One product ID.',
    100,
    130,
    NULL,
    FALSE
)
ON CONFLICT (dtone_product_id)
DO NOTHING;

-- ------------------------------------------------------------
-- COMMENTS FOR PRODUCTION CATALOG
-- ------------------------------------------------------------
-- Before Production:
--
-- 1. Get the real DT One Sandbox product catalog.
-- 2. Confirm:
--      - country
--      - currency
--      - operator
--      - local amount
--      - DT One product ID
--      - EUR selling price
-- 3. Insert the real product IDs.
-- 4. Keep products disabled until verified.
-- 5. Enable only verified products.
--
-- NEVER replace a real DT One product ID with a guessed ID.
-- ------------------------------------------------------------

COMMIT;
