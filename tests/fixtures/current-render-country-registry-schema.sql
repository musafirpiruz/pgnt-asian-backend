CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE pricing_settings(
 country CHAR(2) PRIMARY KEY, fee_eur_cents INTEGER NOT NULL DEFAULT 59,
 afn_per_eur NUMERIC, bonus_percent NUMERIC NOT NULL DEFAULT 0,
 stripe_fee_percent NUMERIC NOT NULL DEFAULT 1.500,
 stripe_fixed_fee_cents INTEGER NOT NULL DEFAULT 25,
 active BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 local_currency_per_eur NUMERIC
);
CREATE TABLE product_catalog(
 id BIGSERIAL PRIMARY KEY, country CHAR(2) NOT NULL, operator VARCHAR(120) NOT NULL,
 amount NUMERIC NOT NULL, currency CHAR(3) NOT NULL, product_id BIGINT NOT NULL,
 price_eur_cents INTEGER NOT NULL, wholesale_price_eur_cents INTEGER,
 bonus_amount NUMERIC NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pricing_settings(country,local_currency_per_eur) VALUES
 ('AF',72.9927),('PK',310.7630),('IN',106.4700),('BD',138.6300);
INSERT INTO product_catalog(country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents) VALUES
 ('AF','ATOMA',115,'AFN',7194,210,189),
 ('AF','ATOMA',100,'AFN',7191,165,NULL),
 ('AF','ATOMA',250,'AFN',7203,411,NULL),
 ('AF','ATOMA',500,'AFN',7213,821,NULL),
 ('AF','ATOMA',1000,'AFN',7233,1641,NULL),
 ('AF','Etisalat',100,'AFN',900002,164,NULL),
 ('AF','Roshan',100,'AFN',900001,164,NULL),
 ('IN','Airtel',100,'INR',900004,120,NULL),
 ('PK','Jazz',100,'PKR',900003,250,NULL);
