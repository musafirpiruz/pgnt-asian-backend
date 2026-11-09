'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const flutter = fs.readFileSync(path.join(__dirname, '..', 'main.dart'), 'utf8');

test('Flutter operator model keeps stable registry identity separate from display name', () => {
  const start = flutter.indexOf('class MobileOperator {');
  const end = flutter.indexOf('// Brand-inspired', start);
  assert.ok(start >= 0 && end > start);
  const model = flutter.slice(start, end);
  assert.ok(model.includes('final String? operatorKey;'));
  assert.ok(model.includes('final String? providerOperatorId;'));
  assert.ok(model.includes('this.operatorKey,'));
  assert.ok(model.includes('this.providerOperatorId,'));
});

test('quote request forwards operatorKey but never trusts or forwards providerOperatorId', () => {
  const start = flutter.indexOf('Future<void> loadPriceQuote()');
  const end = flutter.indexOf('void selectCountry(', start);
  assert.ok(start >= 0 && end > start);
  const method = flutter.slice(start, end);
  assert.ok(method.includes("item['operatorKey']?.toString()"));
  assert.ok(method.includes('operator.operatorKey'));
  assert.ok(!method.includes('providerOperatorId'));
});

test('checkout request forwards operatorKey but never trusts or forwards providerOperatorId', () => {
  const start = flutter.indexOf('Future<void> startPayment()');
  const end = flutter.indexOf('Widget buildHistory()', start);
  assert.ok(start >= 0 && end > start);
  const method = flutter.slice(start, end);
  assert.ok(method.includes("'operatorKey': selectedOperator!.operatorKey!"));
  assert.ok(method.includes('selectedOperator!.operatorKey != null'));
  assert.ok(!method.includes('providerOperatorId'));
});

test('registry parser preserves stable IDs independently of localized display labels', () => {
  const start = flutter.indexOf('factory MobileOperator.fromRegistryJson');
  const end = flutter.indexOf('// Brand-inspired', start);
  assert.ok(start >= 0 && end > start);
  const factory = flutter.slice(start, end);
  for (const field of ["json['display_name']", "json['name']", "json['operator_key']", "json['code']", "json['provider_operator_id']", 'operatorKey:', 'providerOperatorId:']) {
    assert.ok(factory.includes(field), 'missing parser field: ' + field);
  }
  assert.ok(!factory.includes('operatorKey: displayName'));
});

test('registry loader ignores stale responses after country or language changes', () => {
  const start = flutter.indexOf('Future<void> _loadRegistryOperators(String countryCode)');
  const end = flutter.indexOf('  @override\n  void dispose()', start);
  assert.ok(start >= 0 && end > start);
  const loader = flutter.slice(start, end);
  assert.match(loader, /_registryOperatorsRequestGeneration/);
  assert.match(loader, /final requestGeneration = \+\+_registryOperatorsRequestGeneration/);
  assert.match(loader, /final requestedLanguage = languageCode/);
  assert.match(loader, /queryParameters: \{\s*'language': requestedLanguage\s*\}/);
  assert.match(loader, /requestGeneration != _registryOperatorsRequestGeneration/);
  assert.match(loader, /requestedLanguage != languageCode/);
});


test('Flutter country picker loads active destinations from the registry for future country expansion', () => {
  assert.match(flutter, /factory AppCountry\.fromRegistryJson/);
  assert.match(flutter, /_availableCountries = countries/);
  assert.match(flutter, /Future<void> _loadCountries\(\)/);
  assert.match(flutter, /api\/countries/);
  assert.match(flutter, /_availableCountries[\s\S]*?\.map\(\(country\) => countryCard/);
  assert.match(flutter, /_countryCatalogRequestGeneration/);
});

test('Flutter keeps a safe bundled launch-country fallback if registry discovery is unavailable', () => {
  assert.match(flutter, /List<AppCountry> _availableCountries = countries/);
  assert.match(flutter, /Keep the bundled launch-country list when registry discovery is offline/);
});


test('registry country model carries calling code and authoritative phone digit bounds', () => {
  const start = flutter.indexOf('class AppCountry {');
  const end = flutter.indexOf('const List<AppCountry> countries', start);
  assert.ok(start >= 0 && end > start);
  const model = flutter.slice(start, end);
  for (const field of ['callingCode', 'phoneMinDigits', 'phoneMaxDigits', "json['callingCode']", "json['phoneMinDigits']", "json['phoneMaxDigits']"]) {
    assert.ok(model.includes(field), 'missing country metadata: ' + field);
  }
});

test('customer phone validation uses registry digit bounds when country metadata is available', () => {
  const start = flutter.indexOf('bool isValidPhone(');
  const end = flutter.indexOf('// Euro display helper', start);
  assert.ok(start >= 0 && end > start);
  const validator = flutter.slice(start, end);
  assert.ok(validator.includes('AppCountry? country'));
  assert.ok(validator.includes('country.phoneMinDigits'));
  assert.ok(validator.includes('country.phoneMaxDigits'));
  assert.ok(validator.includes('country.callingCode'));
  assert.match(flutter, /isValidPhone\(selectedCountry\.code,\s*phone,\s*country:\s*selectedCountry\)/);
});


const backend = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('customer checkout validates destination against active DT One country registry', () => {
  const start = backend.indexOf('async function getActiveCountryConfig(');
  const end = backend.indexOf('// Get the recipient\'s local currency.', start);
  assert.ok(start >= 0 && end > start);
  const helper = backend.slice(start, end);
  assert.match(helper, /FROM country_registry/);
  assert.match(helper, /status = 'active'/);
  assert.match(helper, /provider = 'dtone'/);
  assert.match(helper, /provider_country_code IS NOT NULL/);
  assert.match(helper, /phone_min_digits/);
  assert.match(helper, /phone_max_digits/);
  assert.match(helper, /async function validateRegistryPhone/);
});

test('checkout and ranged quotes use registry phone metadata instead of the legacy country allow-list', () => {
  const checkoutStart = backend.indexOf('async function validateCheckoutInput(body)');
  const checkoutEnd = backend.indexOf('// =====================================================\n// PART 3/8', checkoutStart);
  assert.ok(checkoutStart >= 0 && checkoutEnd > checkoutStart);
  const checkout = backend.slice(checkoutStart, checkoutEnd);
  assert.match(checkout, /await getActiveCountryConfig\(country\)/);
  assert.match(checkout, /await validateRegistryPhone\(/);
  assert.doesNotMatch(checkout, /isValidCountry\(country\)/);

  const rangedStart = backend.indexOf("app.post('/api/ranged-quotes'");
  const rangedEnd = backend.indexOf("app.get('/api/pricing/quote'", rangedStart);
  assert.ok(rangedStart >= 0 && rangedEnd > rangedStart);
  const ranged = backend.slice(rangedStart, rangedEnd);
  assert.match(ranged, /await getActiveCountryConfig\(country\)/);
  assert.match(ranged, /await validateRegistryPhone\(/);
  assert.doesNotMatch(ranged, /validatePhone\(/);
});


test('catalog product lookup and customer discovery require active canonical registry currency', () => {
  const productStart = backend.indexOf('async function getProduct(');
  const productEnd = backend.indexOf('\napp.', productStart + 20);
  assert.ok(productStart >= 0 && productEnd > productStart);
  const productLookup = backend.slice(productStart, productEnd);
  assert.match(productLookup, /await getActiveCountryConfig\(country, client\)/);
  assert.match(productLookup, /countryConfig\.destination_currency/);

  const discoveryStart = backend.indexOf("app.get('/api/ranged-products'");
  const discoveryEnd = backend.indexOf("app.post('/api/ranged-quotes'", discoveryStart);
  assert.ok(discoveryStart >= 0 && discoveryEnd > discoveryStart);
  const discovery = backend.slice(discoveryStart, discoveryEnd);
  assert.match(discovery, /await getActiveCountryConfig\(country\)/);

  const quoteStart = backend.indexOf("app.get('/api/pricing/quote'");
  const quoteEnd = backend.indexOf("app.post('/api/", quoteStart + 10);
  assert.ok(quoteStart >= 0 && quoteEnd > quoteStart);
  const quote = backend.slice(quoteStart, quoteEnd);
  assert.match(quote, /await getActiveCountryConfig\(country\)/);
});

test('admin DT One country selector is populated only from the canonical registry', () => {
  assert.match(backend, /app\.get\('\/api\/admin\/dtone\/countries', requireAdmin/);
  const endpointStart = backend.indexOf("app.get('/api/admin/dtone/countries'");
  const endpointEnd = backend.indexOf("app.get('/api/admin/dtone/operators'", endpointStart);
  assert.ok(endpointStart >= 0 && endpointEnd > endpointStart);
  const endpoint = backend.slice(endpointStart, endpointEnd);
  assert.match(endpoint, /FROM country_registry/);
  assert.match(endpoint, /provider = 'dtone'/);
  assert.match(endpoint, /provider_country_code/);
  assert.match(endpoint, /status IN \('draft', 'configuring', 'testing', 'active', 'disabled', 'legacy'\)/);
  assert.match(backend, /adminRequest\('\/api\/admin\/dtone\/countries'\)/);
  assert.match(backend, /countryNames\[country\.countryIsoCode\]=country\.name/);
  assert.doesNotMatch(backend, /const operatorOptions=/);
  assert.doesNotMatch(backend, /countryMap\s*=\s*\{\s*AFG:/);
});

test('registry loading exposes retryable loading and empty/error states instead of silently hiding networks', () => {
  assert.match(flutter, /bool _registryOperatorsLoading = false/);
  assert.match(flutter, /String\? _registryOperatorsError/);
  const start = flutter.indexOf('Future<void> _loadRegistryOperators(String countryCode)');
  const end = flutter.indexOf('  @override\n  void dispose()', start);
  assert.ok(start >= 0 && end > start);
  const loader = flutter.slice(start, end);
  assert.match(loader, /_registryOperatorsLoading = true/);
  assert.match(loader, /_registryOperatorsLoading = false/);
  assert.match(loader, /HTTP \$\{response\.statusCode\}/);
  assert.match(loader, /parsed\.isEmpty/);
  assert.match(loader, /_applyDetectedAfghanOperator\(\)/);

  const selectorStart = flutter.indexOf('Widget buildOperatorSelector()');
  const selectorEnd = flutter.indexOf('Widget _buildStepHeader', selectorStart);
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart);
  const selector = flutter.slice(selectorStart, selectorEnd);
  assert.match(selector, /CircularProgressIndicator/);
  assert.match(selector, /_registryOperatorsError/);
  assert.match(selector, /_loadRegistryOperators\(selectedCountry\.code\)/);
});

test('Afghan phone prefix detection is re-applied after verified operators finish loading', () => {
  const loaderStart = flutter.indexOf('Future<void> _loadRegistryOperators(String countryCode)');
  const loaderEnd = flutter.indexOf('  @override\n  void dispose()', loaderStart);
  const loader = flutter.slice(loaderStart, loaderEnd);
  assert.match(loader, /_applyDetectedAfghanOperator\(\);/);
  const detectorStart = flutter.indexOf('void _applyDetectedAfghanOperator()');
  const detectorEnd = flutter.indexOf('  @override\n  void dispose()', detectorStart);
  assert.ok(detectorStart >= 0 && detectorEnd > detectorStart);
  const detector = flutter.slice(detectorStart, detectorEnd);
  assert.match(detector, /detectAfghanOperator\(phoneController\.text\)/);
  assert.match(detector, /countryOperators/);
  assert.match(detector, /loadPriceQuote\(\)/);
});

test('Afghan prefix auto-detection matches stable operator keys, not localized display labels', () => {
  const start = flutter.indexOf('void _applyDetectedAfghanOperator()');
  const end = flutter.indexOf('  @override\n  void dispose()', start);
  assert.ok(start >= 0 && end > start);
  const detector = flutter.slice(start, end);
  assert.match(detector, /operator\.operatorKey/);
  assert.match(detector, /case 'AWCC'/);
  assert.match(detector, /case 'ROSHAN'/);
  assert.match(detector, /case 'ETISALAT'/);
  assert.match(detector, /case 'ATOMA'/);
  assert.match(detector, /case 'SALAAM'/);
  assert.doesNotMatch(detector, /operator\.name\.toLowerCase\(\) == detectedName/);
});


test('Flutter fixed denominations come only from the verified DT One product endpoint', () => {
  assert.match(flutter, /api\/countries\/\$\{Uri\.encodeComponent\(countryCode\)\}\/operators\/\$\{Uri\.encodeComponent\(operatorKey\)\}\/products/);
  assert.match(flutter, /_verifiedFixedProductsOperatorKey/);
  assert.match(flutter, /dtoneProductId/);
  assert.match(flutter, /fixedProducts\.isNotEmpty/);
  assert.match(flutter, /api\/pricing\/quote/);
  assert.match(flutter, /د DT One له خوا تایید شوي مقدارونه/);
  assert.doesNotMatch(flutter, /rechargeAmounts/);
});

test('Flutter clears verified fixed denominations when country or operator changes', () => {
  assert.match(flutter, /_verifiedFixedProducts = \[\]/);
  assert.match(flutter, /_verifiedFixedProductsOperatorKey = null/);
});
