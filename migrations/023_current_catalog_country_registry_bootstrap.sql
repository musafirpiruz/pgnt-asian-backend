-- PGNT current-schema country registry bootstrap (forward-only).
-- Seeds only the four markets already present in pricing_settings.
-- All countries/operators/product mappings remain non-active pending provider verification.
BEGIN;
DO $$
DECLARE bad_count BIGINT;
BEGIN
  IF to_regclass(current_schema() || '.pricing_settings') IS NULL
     OR to_regclass(current_schema() || '.product_catalog') IS NULL THEN
    RAISE EXCEPTION 'Current-schema bootstrap requires pricing_settings and product_catalog';
  END IF;
  SELECT COUNT(*) INTO bad_count
  FROM (VALUES ('AF','AFN'),('PK','PKR'),('IN','INR'),('BD','BDT')) expected(country_code,currency)
  LEFT JOIN pricing_settings p ON p.country::text=expected.country_code
  WHERE p.country IS NULL OR p.local_currency_per_eur IS NULL OR p.local_currency_per_eur <= 0;
  IF bad_count > 0 THEN RAISE EXCEPTION 'Missing pricing settings or valid local FX for % expected countries', bad_count; END IF;
  SELECT COUNT(*) INTO bad_count FROM product_catalog p
  WHERE (p.country='AF' AND p.currency <> 'AFN') OR (p.country='PK' AND p.currency <> 'PKR')
     OR (p.country='IN' AND p.currency <> 'INR') OR (p.country='BD' AND p.currency <> 'BDT')
     OR p.country NOT IN ('AF','PK','IN','BD');
  IF bad_count > 0 THEN RAISE EXCEPTION 'Product catalog contains country/currency rows outside the reviewed four-country mapping'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS country_registry (
 country_code CHAR(2) PRIMARY KEY CHECK(country_code ~ '^[A-Z]{2}$'),
 country_name VARCHAR(120) NOT NULL,
 destination_currency CHAR(3) NOT NULL CHECK(destination_currency ~ '^[A-Z]{3}$'),
 calling_code VARCHAR(8) NOT NULL,
 phone_min_digits SMALLINT NOT NULL CHECK(phone_min_digits BETWEEN 1 AND 15),
 phone_max_digits SMALLINT NOT NULL CHECK(phone_max_digits BETWEEN phone_min_digits AND 15),
 provider VARCHAR(32) NOT NULL DEFAULT 'dtone',
 provider_country_code VARCHAR(8),
 status VARCHAR(20) NOT NULL DEFAULT 'legacy' CHECK(status IN ('draft','configuring','testing','active','disabled','legacy')),
 configuration_version INTEGER NOT NULL DEFAULT 1 CHECK(configuration_version > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS country_localizations (
 country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
 language_code VARCHAR(8) NOT NULL, display_name VARCHAR(120) NOT NULL,
 is_fallback BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(country_code,language_code)
);
CREATE TABLE IF NOT EXISTS country_operators (
 id BIGSERIAL PRIMARY KEY, country_code CHAR(2) NOT NULL REFERENCES country_registry(country_code) ON DELETE CASCADE,
 provider VARCHAR(32) NOT NULL DEFAULT 'dtone', provider_operator_id VARCHAR(80),
 operator_key VARCHAR(100) NOT NULL, display_name VARCHAR(120) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT FALSE, verified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(country_code,operator_key)
);
-- Legacy country_operators schemas may require a provider ID. Bootstrap rows
-- are intentionally unverified, so provider_operator_id must remain nullable
-- until an authoritative DT One operator mapping is confirmed.
-- Existing installations may already have a country_operators table from
-- the earlier registry draft. Bring its verification metadata forward safely.
ALTER TABLE country_operators ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE country_operators ALTER COLUMN provider_operator_id DROP NOT NULL;
CREATE TABLE IF NOT EXISTS country_operator_localizations (
 operator_id BIGINT NOT NULL REFERENCES country_operators(id) ON DELETE CASCADE,
 language_code VARCHAR(8) NOT NULL, display_name VARCHAR(120) NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(operator_id,language_code)
);
CREATE TABLE IF NOT EXISTS country_operator_products (
 id BIGSERIAL PRIMARY KEY, country_code CHAR(2) NOT NULL, operator_key VARCHAR(100) NOT NULL,
 product_catalog_id BIGINT NOT NULL REFERENCES product_catalog(id) ON DELETE RESTRICT,
 active BOOLEAN NOT NULL DEFAULT FALSE, verified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(country_code,operator_key) REFERENCES country_operators(country_code,operator_key) ON DELETE RESTRICT,
 UNIQUE(country_code,operator_key,product_catalog_id)
);
DO $$
DECLARE item RECORD; expected RECORD; normalized_key TEXT; existing_row RECORD; bad_count BIGINT;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('AF','Afghanistan','AFN','+93',9,9),('PK','Pakistan','PKR','+92',10,10),
  ('IN','India','INR','+91',10,10),('BD','Bangladesh','BDT','+880',10,10)
 ) AS v(country_code,country_name,currency,calling_code,min_digits,max_digits)
 LOOP
  SELECT destination_currency,country_name,calling_code INTO existing_row FROM country_registry WHERE country_code=expected.country_code;
  IF FOUND AND (existing_row.destination_currency<>expected.currency OR existing_row.country_name<>expected.country_name OR existing_row.calling_code<>expected.calling_code)
  THEN RAISE EXCEPTION 'Conflicting existing country registry row for %', expected.country_code; END IF;
  INSERT INTO country_registry(country_code,country_name,destination_currency,calling_code,phone_min_digits,phone_max_digits,provider,status)
  VALUES(expected.country_code,expected.country_name,expected.currency,expected.calling_code,expected.min_digits,expected.max_digits,'dtone','legacy')
  ON CONFLICT(country_code) DO NOTHING;
  INSERT INTO country_localizations(country_code,language_code,display_name) VALUES
  (expected.country_code,'en',expected.country_name),
  (expected.country_code,'ps',CASE expected.country_code WHEN 'AF' THEN 'افغانستان' WHEN 'PK' THEN 'پاکستان' WHEN 'IN' THEN 'هند' ELSE 'بنګله‌دېش' END),
  (expected.country_code,'fa',CASE expected.country_code WHEN 'AF' THEN 'افغانستان' WHEN 'PK' THEN 'پاکستان' WHEN 'IN' THEN 'هند' ELSE 'بنگلادیش' END),
  (expected.country_code,'ur',CASE expected.country_code WHEN 'AF' THEN 'افغانستان' WHEN 'PK' THEN 'پاکستان' WHEN 'IN' THEN 'بھارت' ELSE 'بنگلہ دیش' END),
  (expected.country_code,'hi',CASE expected.country_code WHEN 'AF' THEN 'अफ़ग़ानिस्तान' WHEN 'PK' THEN 'पाकिस्तान' WHEN 'IN' THEN 'भारत' ELSE 'बांग्लादेश' END),
  (expected.country_code,'bn',CASE expected.country_code WHEN 'AF' THEN 'আফগানিস্তান' WHEN 'PK' THEN 'পাকिस्तान' WHEN 'IN' THEN 'ভারত' ELSE 'বাংলাদেশ' END)
  ON CONFLICT(country_code,language_code) DO NOTHING;
 END LOOP;
 FOR item IN SELECT DISTINCT country::text AS country_code,operator FROM product_catalog WHERE country IN ('AF','PK','IN','BD') ORDER BY country::text,operator
 LOOP
  normalized_key:=lower(regexp_replace(trim(item.operator),'[^a-zA-Z0-9]+','-','g'));
  normalized_key:=trim(both '-' from normalized_key);
  IF normalized_key='' THEN RAISE EXCEPTION 'Cannot derive stable operator key from empty catalog operator for country %',item.country_code; END IF;
  INSERT INTO country_operators(country_code,operator_key,display_name,provider_operator_id,active,verified_at)
  VALUES(item.country_code,normalized_key,item.operator,NULL,FALSE,NULL) ON CONFLICT(country_code,operator_key) DO NOTHING;
  SELECT display_name INTO existing_row FROM country_operators WHERE country_code=item.country_code AND operator_key=normalized_key;
  IF existing_row.display_name<>item.operator THEN RAISE EXCEPTION 'Operator key collision for country % and key %',item.country_code,normalized_key; END IF;
  INSERT INTO country_operator_localizations(operator_id,language_code,display_name)
  SELECT id,'en',display_name FROM country_operators WHERE country_code=item.country_code AND operator_key=normalized_key
  ON CONFLICT(operator_id,language_code) DO NOTHING;
  INSERT INTO country_operator_products(country_code,operator_key,product_catalog_id,active,verified_at)
  SELECT p.country,normalized_key,p.id,FALSE,NULL FROM product_catalog p WHERE p.country=item.country_code AND p.operator=item.operator
  ON CONFLICT(country_code,operator_key,product_catalog_id) DO NOTHING;
 END LOOP;
 SELECT COUNT(*) INTO bad_count FROM country_operators WHERE active OR verified_at IS NOT NULL;
 IF bad_count>0 THEN RAISE EXCEPTION 'Bootstrap invariant failed: operator activation/verification found'; END IF;
 SELECT COUNT(*) INTO bad_count FROM country_operator_products WHERE active OR verified_at IS NOT NULL;
 IF bad_count>0 THEN RAISE EXCEPTION 'Bootstrap invariant failed: product mapping activation/verification found'; END IF;
 SELECT COUNT(*) INTO bad_count FROM product_catalog WHERE active;
 IF bad_count>0 THEN RAISE EXCEPTION 'Bootstrap invariant failed: existing product catalog contains active products'; END IF;
END $$;
COMMIT;
