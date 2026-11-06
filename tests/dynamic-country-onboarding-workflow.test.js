'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('DT One country discovery is paginated, read-only, and never activates a country', () => {
  const start = server.indexOf("app.get('/api/admin/dtone/countries'");
  const end = server.indexOf('// Database-backed country onboarding.', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/countries/);
  assert.match(route, /per_page/);
  assert.match(route, /maxPages = 20/);
  assert.match(route, /complete: !truncated/);
  assert.match(route, /readOnly: true/);
  assert.match(route, /transactionCreated: false/);
  assert.doesNotMatch(route, /INSERT INTO country_registry|UPDATE country_registry|POST.*\/v1\/transactions/i);
});

test('provider country mapping is verified against DT One before it is saved', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/dtone-mapping'");
  const end = server.indexOf('// Customer discovery exposes explicitly active countries plus the four existing', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /\/v1\/countries/);
  assert.match(route, /providerCountryCode/);
  assert.match(route, /verification_status/);
  assert.match(route, /country_mapping_verified/);
  assert.match(route, /countryStatus: local\.rows\[0\]\.status/);
  assert.match(route, /customerVisible: false/);
});

test('dynamic catalog sync checks both price currency units and refuses stale FX', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/dtone-catalog/sync'");
  const end = server.indexOf("app.post('/api/admin/fx/rates/refresh'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /prices\?\.wholesale\?\.unit/);
  assert.match(route, /prices\?\.retail\?\.unit/);
  assert.match(route, /retailCurrency !== wholesaleCurrency/);
  assert.match(route, /expires_at>NOW\(\)/);
  assert.match(route, /observed_at>=NOW\(\)-INTERVAL '5 days'/);
  assert.match(route, /catalog_status/);
  assert.match(route, /'disabled'/);
  assert.match(route, /price_currency_verified/);
  assert.match(route, /confirmImport/);
  assert.match(route, /productsRemainDisabled: true/);
  assert.match(route, /transactionCreated: false/);
  assert.doesNotMatch(route, /catalog_status='active'|active\s*=\s*TRUE/i);
});

test('dynamic country catalog preview calculates customer EUR prices from FX, app fees and Stripe fees', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/dtone-catalog/sync'");
  const end = server.indexOf("app.post('/api/admin/fx/rates/refresh'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /destinationCurrency/);
  assert.match(route, /customerPricePreview/);
  assert.match(route, /getPricingSettings\(pricingClient, countryCode\)/);
  assert.match(route, /resolveProductPricing\(/);
  assert.match(route, /calculateFinalPrice\(/);
  assert.match(route, /estimatedStripeFeeEur/);
  assert.match(route, /estimatedCustomerPriceEur/);
  assert.match(route, /products: previews/);
  assert.match(route, /productsRemainDisabled: true/);
});
 
test('dynamic pricing treats EUR as the exact base rate without requiring an FX observation', () => {
  const start = server.indexOf('async function getPricingSettings');
  const end = server.indexOf('// Read an enabled product from the database.', start);
  assert.ok(start >= 0 && end > start);
  const resolver = server.slice(start, end);
  assert.match(resolver, /destinationUnitsPerEur = 1/);
  assert.match(resolver, /destinationCurrency !== 'EUR'/);
  assert.match(resolver, /A fresh destination-currency FX rate is required/);
});

test('FX rates have source provenance, freshness and rejected quotes do not create fake rates', () => {
  const start = migration.indexOf('const globalFxVersion = "018_global_provider_currency_fx"');
  const end = migration.indexOf('const countryPricingVersion', start);
  assert.ok(start >= 0 && end > start);
  const schema = migration.slice(start, end);
  assert.match(schema, /fx_currency_rates/);
  assert.match(schema, /fx_currency_rate_history/);
  assert.match(schema, /CHECK \(\(accepted = TRUE AND units_per_eur > 0\) OR \(accepted = FALSE AND units_per_eur IS NULL\)\)/);
  assert.match(server, /function refreshFxCurrencyRate/);
  assert.match(server, /5 \* 86400000/);
  assert.match(server, /24 \* 60 \* 60 \* 1000/);
  assert.match(server, /previous saved rate was preserved/);
});

test('country preflight requires provider, phone, operator, product, pricing, FX and six translations', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/validate'");
  const end = server.indexOf("app.post('/api/admin/countries/:countryCode/activate'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  for (const check of [
    'provider_mapping_verified','phone_validation_configured','active_operator_available',
    'active_product_available','country_pricing_active','destination_fx_fresh',
    'localizations_complete','operator_localizations_complete','product_prices_valid',
  ]) assert.ok(route.includes(check), check);
  for (const language of ['en','ps','fa','ur','hi','bn']) assert.ok(route.includes(language), language);
});

test('country activation requires current-version successful preflight and disable removes it from runtime cache', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/activate'");
  const end = server.indexOf("app.post('/api/admin/countries/:countryCode/disable'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /configuration_version/);
  assert.match(route, /statusByName\.get\(name\) !== 'pass'/);
  assert.match(route, /status='active'/);
  const disableStart = end;
  const disableEnd = server.indexOf('// Customer APIs expose only active', disableStart);
  const disableRoute = server.slice(disableStart, disableEnd);
  assert.match(disableRoute, /DYNAMIC_COUNTRY_CONFIG\.delete\(code\)/);
});

test('customer catalog APIs only expose reviewed operators and products for active or legacy countries', () => {
  const start = server.indexOf("app.get('/api/countries/:countryCode/operators'");
  const end = server.indexOf('// Read-only wallet integrity diagnostics.', start);
  assert.ok(start >= 0 && end > start);
  const routes = server.slice(start, end);
  assert.match(routes, /status IN \('active','legacy'\)/);
  assert.match(routes, /active=TRUE/);
  assert.match(routes, /catalog_status='active'/);
  assert.match(routes, /verification_status='verified'/);
  assert.match(routes, /price_currency_verified=TRUE/);
});

test('Flutter loads country list, operators and denominations from backend endpoints', () => {
  assert.match(flutter, /api\/countries\/active/);
  assert.match(flutter, /api\/countries\/\$countryCode\/operators\?language=\$languageCode/);
  assert.match(flutter, /api\/countries\/\$countryCode\/products/);
  assert.match(flutter, /_availableCountries/);
  assert.match(flutter, /_loadedCountryOperators/);
  assert.match(flutter, /_loadedCountryAmounts/);
});

test('operator translations are stored per operator and required for activation', () => {
  const start = server.indexOf("app.put('/api/admin/countries/:countryCode/operators/:operatorId/localizations'");
  const end = server.indexOf("app.patch('/api/admin/countries/:countryCode/operators/:operatorId'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  for (const language of ['en','ps','fa','ur','hi','bn']) assert.ok(route.includes(language), language);
  assert.match(route, /country_operator_localizations/);
  assert.match(server, /operator_localizations_complete/);
  assert.match(migration, /020_country_operator_localizations/);
});

test('catalog detail must match the verified provider country and listed operator identity', () => {
  const start = server.indexOf("app.post('/api/admin/countries/:countryCode/dtone-catalog/sync'");
  const end = server.indexOf("app.post('/api/admin/fx/rates/refresh'", start);
  const route = server.slice(start, end);
  assert.match(route, /detailCountryCode !== providerCountryCode/);
  assert.match(route, /providerOperatorId !== listedOperatorId/);
  assert.match(route, /wholesaleCurrency/);
  assert.match(route, /retailCurrency !== wholesaleCurrency/);
});

test('operator-specific pricing is no longer limited to the four legacy countries', () => {
  const start = server.indexOf("app.get('/api/admin/operator-pricing'");
  const end = server.indexOf("app.get('/api/admin/pricing'", start);
  assert.ok(start >= 0 && end > start);
  const routes = server.slice(start, end);
  assert.match(routes, /FROM country_registry WHERE country_code=\$1/);
  assert.match(routes, /operator_pricing_settings/);
  assert.doesNotMatch(routes, /isValidCountry\(country\)/);
  assert.match(migration, /021_dynamic_operator_pricing_countries/);
});

test('admin onboarding wizard is available without embedding the admin secret', () => {
  const start = server.indexOf("app.get('/admin-countries'");
  const end = server.indexOf('// Start the server only after configuration checks.', start);
  assert.ok(start >= 0 && end > start);
  const page = server.slice(start, end);
  assert.match(page, /Create draft country/);
  assert.match(page, /Discover DT One supported countries/);
  assert.match(page, /Run preflight checks/);
  assert.match(page, /Activate only if every check passes/);
  assert.match(page, /adminKey/);
  assert.doesNotMatch(page, /ADMIN_API_KEY\s*=/);
});


test('country currency discovery is source-backed and requires explicit admin confirmation', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  assert.match(server, /\/api\/admin\/countries\/:countryCode\/currency-discovery/);
  assert.match(server, /restcountries-v3\.1/);
  assert.match(server, /selectedAutomatically: false/);
  assert.match(server, /\/api\/admin\/countries\/:countryCode\/destination-currency/);
  assert.match(server, /Select a currency returned by the latest verified country currency discovery/);
  assert.match(server, /Currency cannot change after catalog import/);
  assert.match(migration, /022_country_currency_discovery/);
  assert.match(migration, /source_reference TEXT NOT NULL/);
  assert.match(migration, /selection_status VARCHAR\(20\)/);
});


test('country onboarding admin page exposes currency discovery before draft creation', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /onclick="discoverNewCurrency\(\)"/);
  assert.match(server, /Discover country currency/);
  assert.match(server, /Select verified currency/);
  assert.match(server, /destination-currency','PUT'/);
});


test('customer country discovery exposes the verified local currency symbol to Flutter', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');
  assert.match(server, /AS "currencySymbol"/);
  assert.match(server, /jsonb_array_elements\(d\.currencies\)/);
  assert.match(flutter, /raw\['currencySymbol'\]/);
  assert.match(flutter, /discoveredSymbol\.isNotEmpty \? discoveredSymbol : _currencySymbol\(currency\)/);
});

test('customer country API and Flutter use the verified destination currency symbol', () => {
  const activeCountriesStart = server.indexOf("app.get('/api/countries/active'");
  const activeCountriesEnd = server.indexOf("\n});", activeCountriesStart);
  assert.ok(activeCountriesStart >= 0 && activeCountriesEnd > activeCountriesStart);
  const activeCountriesRoute = server.slice(activeCountriesStart, activeCountriesEnd);
  assert.match(activeCountriesRoute, /currencySymbol/);
  assert.match(activeCountriesRoute, /country_currency_discoveries/);
  assert.match(flutter, /raw\['currencySymbol'\]/);
  assert.match(flutter, /discoveredSymbol\.isNotEmpty/);
});


test('country currency PostgreSQL integration check validates migration provenance without production activation', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'country-currency-discovery.integration.sql'), 'utf8');
  assert.match(sql, /ON_ERROR_STOP/);
  assert.match(sql, /country_currency_discoveries/);
  assert.match(sql, /source_reference/);
  assert.match(sql, /integration-test/);
  assert.match(sql, /selection_status='pending'/);
  assert.doesNotMatch(sql, /UPDATE country_registry|INSERT INTO orders|INSERT INTO payments|INSERT INTO refunds/i);
});


test('currency discovery never preselects even a single candidate in the admin wizard', () => {
  const adminPageStart = server.indexOf("app.get('/admin-countries'");
  const adminPageEnd = server.indexOf('// Start the server only after configuration checks.', adminPageStart);
  assert.ok(adminPageStart >= 0 && adminPageEnd > adminPageStart);
  const page = server.slice(adminPageStart, adminPageEnd);
  assert.match(page, /Select verified currency/);
  assert.doesNotMatch(page, /select\.value\s*=\s*r\.data\.currencies\[0\]\.currency/);
});


test('Flutter dynamic country loader is syntactically complete and remains inside the state class', () => {
  assert.match(flutter, /if \(!RegExp\(r'\^\[A-Z\]\{2\}\$'\)\.hasMatch\(code\)/);
  assert.match(flutter, /parsed\.add\(AppCountry\(/);
  assert.doesNotMatch(flutter, /\n\}\n\)\.hasMatch\(currency\)\) continue;/);
  assert.equal((flutter.match(/Future<void> _loadActiveCountries\(\)/g) || []).length, 1);
});

test('USD currency fallback uses a valid raw Dart dollar symbol', () => {
  assert.match(flutter, /'USD': r'\$'/);
});

test('dynamic country checkout resolves only reviewed catalog products for the selected country', () => {
  const start = server.indexOf('async function getProduct(');
  const end = server.indexOf('// Calculate the final customer price.', start);
  assert.ok(start >= 0 && end > start);
  const lookup = server.slice(start, end);
  assert.ok(lookup.includes('FROM country_products p'));
  assert.ok(lookup.includes("p.catalog_status = 'active'"));
  assert.ok(lookup.includes("p.verification_status = 'verified'"));
  assert.ok(lookup.includes('p.price_currency_verified = TRUE'));
  assert.ok(lookup.includes('p.country_code = $2'));
  assert.ok(lookup.includes('p.retail_eur_cents >= p.wholesale_eur_cents'));
  assert.ok(lookup.includes('Selected operator does not match product.'));
  assert.ok(lookup.includes('Selected amount does not match product.'));
});

test('paid-order fulfillment rechecks dynamic and legacy product country, operator and denomination', () => {
  assert.ok(server.includes('Dynamic catalog rows are preferred'));
  assert.ok(server.includes('p.id = $1 AND p.country_code = $2'));
  assert.ok(server.includes('LOWER(o.display_name) = LOWER($3) AND p.denomination = $4'));
  assert.ok(server.includes('LOWER(operator) = LOWER($4) AND amount = $5'));
  assert.ok(server.includes("String(product.rows[0].operator || '').trim().toLowerCase()"));
  assert.ok(server.includes('Number(product.rows[0].amount) !== Number(order.amount)'));
});
