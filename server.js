'use strict';

// =====================================================
// PGNT ASIAN TOPUP
// PART 1/8 — SERVER CONFIGURATION
// Customer payment currency: EUR (€)
// USD is not used.
// =====================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Stripe = require('stripe');
const { Pool } = require('pg');

const app = express();

app.disable('x-powered-by');

const PORT = Number(process.env.PORT) || 10000;

const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  'https://pgnt-asian-backend.onrender.com'
).replace(/\/+$/, '');

// Stripe configuration
const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || '';

const STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || '';

// PostgreSQL configuration
const DATABASE_URL =
  process.env.DATABASE_URL || '';

// DT One configuration
const DTONE_API_KEY =
  process.env.DTONE_API_KEY || '';

const DTONE_API_SECRET =
  process.env.DTONE_API_SECRET || '';

const configuredDtOneBaseUrl = (
  process.env.DTONE_API_BASE_URL ||
  process.env.DTONE_BASE_URL ||
  'https://preprod-dvs-api.dtone.com'
).replace(/\/+$/, '');

// Normalize the legacy pre-production hostname to the current
// DVS API hostname documented by DT One.
const DTONE_API_BASE_URL = configuredDtOneBaseUrl
  .replace(/^https:\/\/preprod-api\.dtone\.com$/i, 'https://preprod-dvs-api.dtone.com')
  .replace(/\/v1$/i, '');

const DTONE_CALLBACK_URL =
  process.env.DTONE_CALLBACK_URL ||
  `${APP_BASE_URL}/api/dtone/callback`;

// Safe startup diagnostics: report only the public callback host and path,
// never credentials, query strings, or transaction/customer details.
try {
  const callbackUrl = new URL(DTONE_CALLBACK_URL);
  console.info('DT One callback URL configured.', {
    protocol: callbackUrl.protocol,
    hostname: callbackUrl.hostname,
    pathname: callbackUrl.pathname,
    https: callbackUrl.protocol === 'https:',
  });
} catch (_) {
  console.error('DT One callback URL is invalid.');
}

// Admin API configuration
const ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || '';

// Fail closed when Stripe mode and DT One environment do not match.
// Test Stripe keys may only be paired with the exact DT One pre-production host;
// live Stripe keys must not be paired with DT One pre-production.
function isDtOnePreproductionConfigured() {
  try {
    const url = new URL(DTONE_API_BASE_URL);
    return url.protocol === 'https:' &&
      url.hostname === 'preprod-dvs-api.dtone.com' &&
      (url.pathname === '' || url.pathname === '/');
  } catch (_) {
    return false;
  }
}

function arePaymentAndFulfillmentEnvironmentsCompatible() {
  const stripeIsTest = STRIPE_SECRET_KEY.startsWith('sk_test_');
  const dtOneIsPreproduction = isDtOnePreproductionConfigured();
  return stripeIsTest === dtOneIsPreproduction;
}

// Initialize Stripe only when configured
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

// PostgreSQL connection pool
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

// Country codes and recipient currencies.
// Customer payment currency remains EUR.
const COUNTRY_CURRENCIES = Object.freeze({
  AF: 'AFN',
  PK: 'PKR',
  IN: 'INR',
  BD: 'BDT',
});

// One standard customer payment currency.
const PAYMENT_CURRENCY = 'eur';

// Store and calculate customer prices in euro cents.
// Example: 164 cents = €1.64.
const EUR_CURRENCY = 'EUR';

// Basic CORS configuration.
// Set CORS_ORIGIN in Render to your trusted app/web origins.
const configuredCorsOrigins = (
  process.env.CORS_ORIGIN || ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Always allow the backend's own configured public origin so
// its same-origin admin pages can call authenticated API routes.
// Keep all other browser origins explicitly allowlisted.
const ownServiceOrigins = [
  process.env.APP_BASE_URL,
  'https://pgnt-asian-backend.onrender.com',
]
  .filter(Boolean)
  .map((value) => {
    try { return new URL(value).origin; } catch (_) { return null; }
  })
  .filter(Boolean);

const allowedOrigins = [...new Set([
  ...configuredCorsOrigins,
  ...ownServiceOrigins,
])];

app.use(
  cors({
    origin(origin, callback) {
      // Permit requests without an Origin header,
      // such as server-to-server requests and mobile clients.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('Origin not allowed by CORS')
      );
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-admin-api-key',
      'x-order-access-token',
    ],
  })
);

// IMPORTANT:
// Do not add express.json() here.
// The Stripe webhook must receive the raw request body.
// We will add express.json() in the correct order later.

function getCountryCurrency(countryCode) {
  const country = String(countryCode || '')
    .trim()
    .toUpperCase();

  return COUNTRY_CURRENCIES[country] || null;
}

function formatEuro(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error('Invalid EUR amount in cents.');
  }

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: EUR_CURRENCY,
  }).format(cents / 100);
}

// Health check
app.get('/health', async (req, res) => {
  let databaseStatus = 'not_configured';

  if (pool) {
    try {
      await pool.query('SELECT 1');
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'error';

      console.error(
        'Database health check failed:',
        error.message
      );
    }
  }

  const healthy =
    Boolean(pool) &&
    databaseStatus === 'connected' &&
    Boolean(stripe);

  return res.status(healthy ? 200 : 503).json({
    app: 'PGNT ASIAN TOPUP',
    status: healthy ? 'ok' : 'configuration_required',
    paymentCurrency: PAYMENT_CURRENCY,
    database: databaseStatus,
    stripeConfigured: Boolean(stripe),
    stripeWebhookConfigured: Boolean(
      STRIPE_WEBHOOK_SECRET
    ),
    dtoneConfigured: Boolean(
      DTONE_API_KEY && DTONE_API_SECRET
    ),
  });
});
// Customer-facing Stripe return pages.
// These pages do not fulfill orders; fulfillment remains webhook-controlled.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

app.get('/payment-success', async (req, res) => {
  const sessionId = String(req.query.session_id || '');
  if (!sessionId.startsWith('cs_test_') && !sessionId.startsWith('cs_live_')) {
    return res.status(400).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment status</title><h1>Payment status unavailable</h1><p>The Stripe checkout session ID is missing or invalid. Please return to PGNT ASIAN TOPUP support.</p></html>');
  }
  if (!stripe || !pool) {
    return res.status(503).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment status</title><h1>Payment status unavailable</h1><p>Please contact PGNT ASIAN TOPUP support.</p></html>');
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderResult = await pool.query(
      'SELECT order_id, status FROM orders WHERE stripe_session_id = $1 LIMIT 1',
      [session.id]
    );
    const paid = session.payment_status === 'paid';
    const orderStatus = orderResult.rowCount ? orderResult.rows[0].status : 'processing';
    const heading = paid ? 'Payment received' : 'Payment not confirmed';
    const message = paid
      ? (orderStatus === 'completed'
        ? 'Your payment and top-up are complete.'
        : orderStatus === 'topup_review'
          ? 'Your payment was received, but the top-up needs review. Please do not pay again.'
          : 'Your payment was received. The top-up status is being confirmed. Please do not pay again.')
      : 'Stripe has not confirmed a successful payment. No top-up completion is confirmed.';
    return res.status(200).type('html').send(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PGNT ASIAN TOPUP — Payment status</title><style>body{font-family:system-ui,sans-serif;max-width:620px;margin:10vh auto;padding:24px;line-height:1.5;color:#222}h1{color:#7A0C10}section{border:1px solid #ddd;border-radius:12px;padding:20px}small{color:#666}</style></head><body><h1>PGNT ASIAN TOPUP</h1><section><h2>' + escapeHtml(heading) + '</h2><p>' + escapeHtml(message) + '</p><p><strong>Order status:</strong> ' + escapeHtml(orderStatus) + '</p><small>Keep this page for reference. Do not submit another payment for the same order.</small></section></body></html>'
    );
  } catch (error) {
    console.error('Stripe payment-success lookup failed:', error.message);
    return res.status(502).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment status</title><h1>Payment status could not be checked</h1><p>Please do not pay again. Contact PGNT ASIAN TOPUP support to verify your order.</p></html>');
  }
});

app.get('/payment-cancelled', (req, res) => {
  return res.status(200).type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PGNT ASIAN TOPUP — Payment cancelled</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;max-width:620px;margin:10vh auto;padding:24px;line-height:1.5;color:#222}h1{color:#7A0C10}</style></head><body><h1>PGNT ASIAN TOPUP</h1><h2>Checkout cancelled</h2><p>The checkout was cancelled. A successful payment has not been confirmed and no top-up completion is confirmed.</p><p>If you believe you completed a payment, contact support before trying again.</p></body></html>');
});

// =====================================================
// PART 2/8 — COUNTRIES, CURRENCIES & VALIDATION
// PGNT ASIAN TOPUP
// Customer payment currency: EUR (€)
// =====================================================

const SUPPORTED_COUNTRIES = Object.freeze({
  AF: {
    name: 'Afghanistan',
    currency: 'AFN',
    phoneDigits: [9, 9],
    callingCode: '+93',
  },

  PK: {
    name: 'Pakistan',
    currency: 'PKR',
    phoneDigits: [10, 10],
    callingCode: '+92',
  },

  IN: {
    name: 'India',
    currency: 'INR',
    phoneDigits: [10, 10],
    callingCode: '+91',
  },

  BD: {
    name: 'Bangladesh',
    currency: 'BDT',
    phoneDigits: [10, 10],
    callingCode: '+880',
  },
});

// Normalize and validate country code.
function normalizeCountry(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function isValidCountry(country) {
  return Object.prototype.hasOwnProperty.call(
    SUPPORTED_COUNTRIES,
    normalizeCountry(country)
  );
}

// Get the recipient's local currency.
function countryCurrency(country) {
  return getCountryCurrency(
    normalizeCountry(country)
  );
}

// Customer payments always use EUR.
function normalizePaymentCurrency(value) {
  const currency = String(value || '')
    .trim()
    .toUpperCase();

  if (currency !== 'EUR') {
    throw new Error(
      'Customer payment currency must be EUR.'
    );
  }

  return 'eur';
}

// Normalize phone input.
// Accepts local digits or an international number
// beginning with the country's calling code.
function normalizePhone(value, country) {
  const code = normalizeCountry(country);
  const config = SUPPORTED_COUNTRIES[code];

  if (!config) {
    throw new Error('Unsupported country.');
  }

  let phone = String(value || '').trim();

  // Remove common visual separators only.
  phone = phone.replace(/[\s().-]/g, '');

  if (!/^\+?\d+$/.test(phone)) {
    throw new Error(
      'Phone number contains invalid characters.'
    );
  }

  const callingCode = config.callingCode;

  // Convert a full international number into local format.
  if (phone.startsWith(callingCode)) {
    phone = phone.slice(callingCode.length);
  } else if (
    phone.startsWith('00') &&
    phone.slice(2).startsWith(callingCode.slice(1))
  ) {
    phone = phone.slice(callingCode.length + 1);
  }

  // Accept local numbers only after normalization.
  // Do not silently remove a national trunk prefix.
  if (phone.startsWith('0')) {
    phone = phone.slice(1);
  }

  return phone;
}

function validatePhone(phone, country) {
  const code = normalizeCountry(country);
  const config = SUPPORTED_COUNTRIES[code];

  if (!config) {
    return {
      valid: false,
      error: 'Unsupported country.',
    };
  }

  const normalized = normalizePhone(phone, code);
  const [minDigits, maxDigits] = config.phoneDigits;

  if (!/^\d+$/.test(normalized)) {
    return {
      valid: false,
      error: 'Phone number must contain digits only.',
    };
  }

  if (
    normalized.length < minDigits ||
    normalized.length > maxDigits
  ) {
    return {
      valid: false,
      error:
        `Invalid phone number length for ${config.name}.`,
    };
  }

  return {
    valid: true,
    country: code,
    phone: normalized,
    currency: config.currency,
  };
}

// Validate data received from the checkout request.
function validateCheckoutInput(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid checkout request.');
  }

  const country = normalizeCountry(body.country);

  if (!isValidCountry(country)) {
    throw new Error('Unsupported country.');
  }

  // Reject USD, and any other non-EUR payment currency.
  // The Flutter app's `currency` is the recipient currency (AFN/PKR/INR/BDT),
  // not the Stripe payment currency. Customer payment is always EUR.
  const paymentCurrency = normalizePaymentCurrency(
    body.paymentCurrency || 'EUR'
  );

  const phoneResult = validatePhone(
    body.phone || body.phoneNumber,
    country
  );

  if (!phoneResult.valid) {
    throw new Error(phoneResult.error);
  }

  const rawProductId = String(body.productId || '').trim();
  const productId = rawProductId || null;
  const operator = String(body.operator || '').trim();
  const amount = Number(body.amount);

  if (productId && !/^[1-9]\d*$/.test(productId)) {
    throw new Error('Invalid product ID.');
  }

  // Current Flutter clients send operator + local amount, not a catalog ID.
  if (!productId && (
    !operator || operator.length > 120 ||
    !Number.isSafeInteger(amount) || amount <= 0
  )) {
    throw new Error('Select a valid operator and top-up amount.');
  }

  return {
    country,
    phone: phoneResult.phone,
    productId,
    operator,
    amount,
    paymentCurrency,
    recipientCurrency: countryCurrency(country),
  };}
// =====================================================
// PART 3/8 — PRODUCTS, PRICING, FEES & BONUSES
// All customer prices are stored in EUR cents.
// Example: 164 = €1.64
// =====================================================

// Validate database price fields.
function requireNonNegativeInteger(value, fieldName) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw new Error(
      `Invalid ${fieldName}.`
    );
  }

  return number;
}

function requirePositiveInteger(value, fieldName) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    throw new Error(
      `Invalid ${fieldName}.`
    );
  }

  return number;
}

// Read the current Admin pricing settings.
// Expected database table: pricing_settings
async function getPricingSettings(client, country) {
  const code = normalizeCountry(country);

  const result = await client.query(
    `SELECT
       country,
       fee_eur_cents,
       afn_per_eur,
       bonus_percent,
       stripe_fee_percent,
       stripe_fixed_fee_cents,
       active
     FROM pricing_settings
     WHERE country = $1
     LIMIT 1`,
    [code]
  );

  if (result.rowCount !== 1) {
    throw new Error(
      'Pricing settings are not configured.'
    );
  }

  const settings = result.rows[0];

  if (
    settings.active !== true
  ) {
    throw new Error(
      'Pricing settings are disabled or invalid.'
    );
  }

  const feeCents = requireNonNegativeInteger(
    settings.fee_eur_cents,
    'fee in EUR cents'
  );

  const afnPerEur = Number(settings.afn_per_eur);
  if (!Number.isFinite(afnPerEur) || afnPerEur <= 0) {
    throw new Error('Invalid AFN/EUR exchange rate.');
  }

  const bonusPercent = Number(settings.bonus_percent);
  if (!Number.isFinite(bonusPercent) || bonusPercent < 0 || bonusPercent > 100) {
    throw new Error('Invalid bonus percentage.');
  }

  const stripeFeePercent = Number(settings.stripe_fee_percent);
  const stripeFixedFeeCents = requireNonNegativeInteger(
    settings.stripe_fixed_fee_cents,
    'Stripe fixed fee in EUR cents'
  );
  if (!Number.isFinite(stripeFeePercent) || stripeFeePercent < 0 || stripeFeePercent >= 100) {
    throw new Error('Invalid Stripe fee percentage.');
  }

  return {
    country: code,
    currency: 'EUR',
    feeCents,
    afnPerEur,
    bonusPercent,
    stripeFeePercent,
    stripeFixedFeeCents,
  };
}

// Read an enabled product from the database.
// Expected database table: product_catalog
async function getProduct(client, productId, requestedCountry = null, operator = null, amount = null, options = {}) {
  const result = await client.query(
    `SELECT
       id,
       country,
       currency,
       product_id AS dtone_product_id,
       operator AS name,
       NULL::text AS description,
       amount AS local_amount,
       price_eur_cents,
       wholesale_price_eur_cents,
       active AS enabled
     FROM product_catalog
     WHERE (
       ($1::bigint IS NOT NULL AND id = $1::bigint)
       OR
       ($1::bigint IS NULL AND country = $2 AND LOWER(operator) = LOWER($3) AND amount = $4)
     )
     LIMIT 1`,
    [productId, requestedCountry, operator, amount]
  );

  if (result.rowCount !== 1) {
    throw new Error(
      'Product not found.'
    );
  }

  const product = result.rows[0];

  // Read-only price quotes may inspect disabled catalog products so the app
  // can display a verified preview without enabling checkout. All checkout
  // callers keep the default strict behavior.
  if (product.enabled !== true && options.allowInactive !== true) {
    throw new Error(
      'This product is currently unavailable.'
    );
  }

  const country = normalizeCountry(
    product.country
  );

  if (!isValidCountry(country)) {
    throw new Error(
      'Product country is not supported.'
    );
  }

  // Recipient currency must match the selected country.
  if (
    product.currency !== countryCurrency(country)
  ) {
    throw new Error(
      'Product currency does not match its country.'
    );
  }

  const priceCents = requirePositiveInteger(
    product.price_eur_cents,
    'product price in EUR cents'
  );

  const localAmount = requirePositiveInteger(
    product.local_amount,
    'local top-up amount'
  );

  if (!product.dtone_product_id) {
    throw new Error(
      'DT One product mapping is missing.'
    );
  }

  return {
    id: String(product.id),
    country,
    currency: product.currency,
    dtoneProductId: String(
      product.dtone_product_id
    ),
    name: String(product.name || ''),
    description: String(
      product.description || ''
    ),
    localAmount,
    priceCents,
    wholesalePriceCents: product.wholesale_price_eur_cents == null
      ? null
      : requirePositiveInteger(product.wholesale_price_eur_cents, 'DT One wholesale price in EUR cents'),
  };
}

// Calculate the final customer price.
// The price and fee are both in EUR cents.
function calculateFinalPrice(product, pricing) {
  // An enabled production product must have a verified DT One wholesale
  // cost. Never silently treat an old retail/display price as wholesale.
  const basePriceCents = requirePositiveInteger(
    product.wholesalePriceCents,
    'verified DT One wholesale price in EUR cents'
  );

  const feeCents = requireNonNegativeInteger(
    pricing.feeCents,
    'fee'
  );

  const bonusPercent = Number(
    pricing.bonusPercent
  );

  if (
    !Number.isFinite(bonusPercent) ||
    bonusPercent < 0 ||
    bonusPercent > 100
  ) {
    throw new Error(
      'Invalid bonus percentage.'
    );
  }

  // Gross up the customer charge so that the estimated Stripe percentage
  // and fixed fee are covered while preserving the configured app fee.
  const targetNetCents = basePriceCents + feeCents;
  const stripeRate = pricing.stripeFeePercent / 100;
  const finalPriceCents = Math.ceil(
    (targetNetCents + pricing.stripeFixedFeeCents) / (1 - stripeRate)
  );
  const estimatedStripeFeeCents =
    Math.ceil(finalPriceCents * stripeRate) + pricing.stripeFixedFeeCents;

  if (!Number.isSafeInteger(finalPriceCents) || finalPriceCents <= 0) {
    throw new Error('Final price is outside the supported range.');
  }

  // Bonus is informational until its business rules
  // and the operator's supported delivery amount
  // have been confirmed.
  return {
    currency: 'EUR',
    basePriceCents,
    feeCents,
    estimatedStripeFeeCents,
    stripeFeePercent: pricing.stripeFeePercent,
    stripeFixedFeeCents: pricing.stripeFixedFeeCents,
    finalPriceCents,
    bonusPercent,
    formattedBasePrice: formatEuro(
      basePriceCents
    ),
    formattedFee: formatEuro(feeCents),
    formattedFinalPrice: formatEuro(
      finalPriceCents
    ),
  };
}

// Get a quote using server-side product and pricing data.
// Never accept the final price from the mobile app.
async function getProductQuote(productId, country) {
  if (!pool) {
    throw new Error(
      'Database is not configured.'
    );
  }

  const client = await pool.connect();

  try {
    const product = await getProduct(
      client,
      productId,
      country
    );

    if (
      product.country !== normalizeCountry(country)
    ) {
      throw new Error(
        'Product does not match selected country.'
      );
    }

    const pricing = await getPricingSettings(
      client,
      country
    );

    const price = calculateFinalPrice(
      product,
      pricing
    );

    return {
      productId: product.id,
      productName: product.name,
      country: product.country,
      recipientCurrency: product.currency,
      recipientAmount: product.localAmount,
      paymentCurrency: 'EUR',
      basePriceCents: price.basePriceCents,
      wholesaleCostConfigured: product.wholesalePriceCents !== null,
      feeCents: price.feeCents,
      estimatedStripeFeeCents: price.estimatedStripeFeeCents,
      stripeFeePercent: price.stripeFeePercent,
      stripeFixedFeeCents: price.stripeFixedFeeCents,
      finalPriceCents: price.finalPriceCents,
      formattedBasePrice: price.formattedBasePrice,
      formattedFee: price.formattedFee,
      formattedFinalPrice: price.formattedFinalPrice,
      bonusPercent: price.bonusPercent,
      exchangeRateAfnPerEur: pricing.afnPerEur,
      marketEquivalentEur: product.currency === 'AFN' ? Number((product.localAmount / pricing.afnPerEur).toFixed(2)) : null,
      marketEquivalentEurFormatted: product.currency === 'AFN' ? formatEuro(Math.round((product.localAmount / pricing.afnPerEur) * 100)) : null,
    };
  } finally {
    client.release();
  }
}
// Return a server-authoritative quote for the selected country/operator/amount.
// Quotes are available only for enabled, database-mapped products.
app.get('/api/pricing/quote', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Pricing service is not configured.' });
  }
  const country = normalizeCountry(req.query.country);
  const operator = String(req.query.operator || '').trim();
  const amount = Number(req.query.amount);
  if (!isValidCountry(country) || !operator || operator.length > 120 || !Number.isSafeInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Select a valid country, operator, and amount.' });
  }
  const client = await pool.connect();
  try {
    const product = await getProduct(client, null, country, operator, amount, { allowInactive: true });
    const pricing = await getPricingSettings(client, country);
    const price = calculateFinalPrice(product, pricing);
    return res.json({
      productId: product.id,
      country: product.country,
      operator: product.name,
      recipientCurrency: product.currency,
      recipientAmount: product.localAmount,
      paymentCurrency: 'EUR',
      basePriceCents: price.basePriceCents,
      feeCents: price.feeCents,
      finalPriceCents: price.finalPriceCents,
      formattedBasePrice: price.formattedBasePrice,
      formattedFee: price.formattedFee,
      formattedFinalPrice: price.formattedFinalPrice,
      bonusPercent: price.bonusPercent,
      exchangeRateAfnPerEur: pricing.afnPerEur,
      marketEquivalentEur: product.currency === 'AFN' ? Number((product.localAmount / pricing.afnPerEur).toFixed(2)) : null,
      marketEquivalentEurFormatted: product.currency === 'AFN' ? formatEuro(Math.round((product.localAmount / pricing.afnPerEur) * 100)) : null,
    });
  } catch (error) {
    const message = error.message === 'Product not found.' || error.message === 'This product is currently unavailable.' || error.message === 'DT One product mapping is missing.'
      ? error.message : 'Could not calculate a verified price.';
    return res.status(404).json({ error: message });
  } finally {
    client.release();
  }
});

// =====================================================
// PART 4/8 — EUR STRIPE CHECKOUT
// Requires Parts 1, 2 and 3.
// Register the Stripe webhook BEFORE express.json().
// =====================================================

function createOrderId() {
  return crypto.randomUUID();
}

function getCheckoutUrls() {
  return {
    successUrl:
      `${APP_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl:
      `${APP_BASE_URL}/payment-cancelled`,
  };
}

// Create a checkout session and store its order.
// IMPORTANT: register this route AFTER express.json().
app.post('/api/payments/checkout', async (req, res) => {
  if (!arePaymentAndFulfillmentEnvironmentsCompatible()) {
    console.error('Checkout blocked: Stripe mode and DT One environment do not match.');
    return res.status(503).json({
      error: 'Checkout is temporarily unavailable because payment and top-up environments are not safely matched.',
    });
  }

  if (!pool || !stripe) {
    return res.status(503).json({
      error: 'Payment service is not configured.',
    });
  }

  let input;

  try {
    input = validateCheckoutInput(req.body);
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }

  const client = await pool.connect();
  let transactionOpen = false;
  let orderId = null;
  let stripeSessionCreated = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const product = await getProduct(
      client,
      input.productId,      input.country,
      input.operator,
      input.amount
    );

    if (product.country !== input.country) {
      throw new Error(
        'Product does not match selected country.'
      );
    }

    const pricing = await getPricingSettings(
      client,
      input.country
    );

    const price = calculateFinalPrice(
      product,
      pricing
    );

    // Referral attribution is server-validated and tied to a stable
    // client-generated install identifier. This is abuse friction, not
    // proof of a unique human/device; reward approval remains manual.
    let referralRewardCents = null;
    const referralCode = String(req.body?.referralCode || '').trim().toUpperCase();
    const referralInstallId = String(req.body?.referralInstallId || '').trim();
    let referralInstallHash = null;
    if (referralCode || referralInstallId) {
      if (!/^[A-Z0-9_-]{4,40}$/.test(referralCode) ||
          !/^[A-Za-z0-9._:-]{16,128}$/.test(referralInstallId)) {
        throw new Error('A valid referral code and install identifier are required together.');
      }
      referralInstallHash = crypto.createHash('sha256')
        .update(referralInstallId, 'utf8').digest('hex');
      const referral = await client.query(
        `SELECT code, reward_eur_cents, max_rewards, active
         FROM referral_codes WHERE code = $1 FOR UPDATE`,
        [referralCode]
      );
      if (referral.rowCount !== 1 || referral.rows[0].active !== true ||
          Number(referral.rows[0].reward_eur_cents) <= 0) {
        throw new Error('This referral code is invalid or inactive.');
      }
      referralRewardCents = Number(referral.rows[0].reward_eur_cents);
      const cap = referral.rows[0].max_rewards;
      if (cap !== null) {
        const used = await client.query(
          `SELECT COUNT(*)::int AS count FROM referral_ledger
           WHERE referral_code = $1 AND status IN ('reserved','pending','approved','paid')`,
          [referralCode]
        );
        if (Number(used.rows[0].count) >= Number(cap)) {
          throw new Error('This referral code has reached its reward limit.');
        }
      }
      const attribution = await client.query(
        `INSERT INTO referral_attributions (install_id_hash, referral_code, first_order_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (install_id_hash) DO NOTHING
         RETURNING referral_code`,
        [referralInstallHash, referralCode, null]
      );
      if (attribution.rowCount === 0) {
        const existing = await client.query(
          'SELECT referral_code FROM referral_attributions WHERE install_id_hash = $1 FOR UPDATE',
          [referralInstallHash]
        );
        if (existing.rowCount !== 1 || existing.rows[0].referral_code !== referralCode) {
          throw new Error('This install is already attributed to another referral code.');
        }
      }
    }

    // Influencer attribution is independent of legacy customer referrals.
    const influencerCode = String(req.body?.influencerCode || '').trim().toUpperCase();
    const influencerInstallId = String(req.body?.influencerInstallId || '').trim();
    let influencerCampaignId = null;
    let influencerInstallHash = null;
    if (influencerCode || influencerInstallId) {
      if (!/^[A-Z0-9_-]{4,40}$/.test(influencerCode) || !/^[A-Za-z0-9._:-]{16,128}$/.test(influencerInstallId)) throw new Error('A valid influencer code and install identifier are required together.');
      influencerInstallHash = crypto.createHash('sha256').update(influencerInstallId, 'utf8').digest('hex');
      const campaignResult = await client.query('SELECT id, active, starts_at, ends_at, max_conversions FROM influencer_campaigns WHERE code = $1 FOR UPDATE', [influencerCode]);
      const campaign = campaignResult.rows[0];
      const now = Date.now();
      if (!campaign || campaign.active !== true || new Date(campaign.starts_at).getTime() > now || new Date(campaign.ends_at).getTime() <= now) throw new Error('This influencer campaign is invalid, inactive, or outside its campaign dates.');
      const existingAttribution = await client.query('SELECT campaign_id FROM influencer_attributions WHERE install_hash = $1 FOR UPDATE', [influencerInstallHash]);
      if (existingAttribution.rowCount && Number(existingAttribution.rows[0].campaign_id) !== Number(campaign.id)) throw new Error('This install is already attributed to another influencer campaign.');
      if (!existingAttribution.rowCount) {
        if (campaign.max_conversions !== null) {
          const used = await client.query('SELECT COUNT(*)::int AS count FROM influencer_attributions WHERE campaign_id = $1', [campaign.id]);
          if (Number(used.rows[0].count) >= Number(campaign.max_conversions)) throw new Error('This influencer campaign has reached its conversion limit.');
        }
        await client.query('INSERT INTO influencer_attributions (campaign_id, install_hash) VALUES ($1,$2) ON CONFLICT (install_hash) DO NOTHING', [campaign.id, influencerInstallHash]);
      }
      influencerCampaignId = campaign.id;
    }

    orderId = createOrderId();
    const orderAccessToken = crypto.randomBytes(32).toString('hex');
    const orderAccessTokenHash = crypto.createHash('sha256').update(orderAccessToken, 'utf8').digest('hex');

    // Store only a hash of the secret used to authorize order-status access.
    await client.query(
      `INSERT INTO orders (
         order_id, country, operator, phone, product_id,
         amount, currency, product_price_cents, fee_cents,
         charge_cents, status, order_access_token_hash, referral_code,
         referral_install_id, influencer_campaign_id, influencer_install_hash, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         'awaiting_payment', $11, $12, $13, $14, $15, NOW(), NOW()
       )`,
      [
        orderId, input.country, product.name, input.phone,
        product.id, product.localAmount, product.currency,
        price.basePriceCents, price.feeCents, price.finalPriceCents,
        orderAccessTokenHash, referralCode || null, referralInstallHash,
        influencerCampaignId, influencerInstallHash,
      ]
    );

    // Reserve a referral reward slot in the same transaction as the order.
    // The referral_codes row lock serializes capped checkouts.
    if (referralInstallHash && referralCode && referralRewardCents !== null) {
      await client.query(
        `INSERT INTO referral_ledger
           (referral_code, install_id_hash, order_id, reward_eur_cents, status)
         VALUES ($1, $2, $3, $4, 'reserved')
         ON CONFLICT DO NOTHING`,
        [referralCode, referralInstallHash, orderId, referralRewardCents]
      );
    }

    await client.query('COMMIT');
    transactionOpen = false;

    const urls = getCheckoutUrls();

    // EUR is explicit. Stripe amounts are integer cents.
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: orderId,

        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: `PGNT ASIAN TOPUP - ${product.name}`,
                description:
                  `Mobile top-up for ${input.country}`,
              },
              unit_amount: price.finalPriceCents,
            },
            quantity: 1,
          },
        ],

        metadata: {
          orderId,
          country: input.country,
          productId: product.id,
        },

        payment_intent_data: {
          metadata: {
            orderId,
          },
        },

        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
      },
      {
        idempotencyKey: `checkout-${orderId}`,
      }
    );
    stripeSessionCreated = true;

    await pool.query(
      `UPDATE orders
       SET stripe_session_id = $1,
           updated_at = NOW()
       WHERE order_id = $2
         AND status = 'awaiting_payment'`,
      [session.id, orderId]
    );

    return res.status(201).json({
      orderId,
      orderAccessToken,
      checkoutUrl: session.url,
      paymentCurrency: 'EUR',
      amountCents: price.finalPriceCents,
      amountFormatted: formatEuro(price.finalPriceCents),
    });
  } catch (error) {
    // If Stripe did not create a Checkout Session, release any reserved
    // referral slot so an infrastructure/API error cannot consume the cap.
    // Keep the reservation when Stripe returned a session, even if a later
    // database update fails, because that session may still be payable.
    if (orderId && !transactionOpen && !stripeSessionCreated) {
      try {
        await pool.query(
          `UPDATE orders
           SET status = 'payment_failed', updated_at = NOW()
           WHERE order_id = $1 AND status = 'awaiting_payment'`,
          [orderId]
        );
        await pool.query(
          `UPDATE referral_ledger
           SET status = 'reversed', updated_at = NOW()
           WHERE order_id = $1 AND status = 'reserved'`,
          [orderId]
        );
      } catch (cleanupError) {
        console.error('Checkout reservation cleanup failed:', cleanupError.message);
      }
    }
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Checkout rollback failed:',
          rollbackError.message
        );
      }
    }

    const referralClientErrors = new Set([
      'A valid referral code and install identifier are required together.',
      'This referral code is invalid or inactive.',
      'This referral code has reached its reward limit.',
      'This install is already attributed to another referral code.',
      'A valid influencer code and install identifier are required together.',
      'This influencer campaign is invalid, inactive, or outside its campaign dates.',
      'This install is already attributed to another influencer campaign.',
      'This influencer campaign has reached its conversion limit.',
    ]);
    if (referralClientErrors.has(error.message)) {
      return res.status(400).json({ error: error.message });
    }

    console.error(
      'Checkout creation failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Could not create checkout session.',
    });
  } finally {
    client.release();
  }
});
// Dedicated Stripe + DT One end-to-end test.
// Admin-only; uses a fixed DT One pre-production test number and the
// Stripe test key. It never activates the catalog product.
app.post('/api/admin/stripe-dtone/sandbox-checkout', express.json(), requireAdmin, async (req, res) => {
  if (!pool || !stripe) {
    return res.status(503).json({ error: 'Payment service is not configured.' });
  }
  if (!STRIPE_SECRET_KEY.startsWith('sk_test_') || !isDtOnePreproductionConfigured()) {
    return res.status(403).json({
      error: 'Sandbox checkout is allowed only with a Stripe test key and the exact DT One pre-production host.',
    });
  }
  if (req.body?.confirmSandbox !== true) {
    return res.status(400).json({ error: 'Explicit sandbox confirmation is required.' });
  }

  const client = await pool.connect();
  let orderId = null;
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const catalog = await client.query(
      `SELECT id, product_id, country, operator, amount, currency,
              wholesale_price_eur_cents
       FROM product_catalog
       WHERE product_id = 7194 AND country = 'AF'
         AND operator = 'ATOMA' AND amount = 115 AND currency = 'AFN'
       LIMIT 1`
    );
    if (catalog.rowCount !== 1 || catalog.rows[0].wholesale_price_eur_cents == null) {
      throw new Error('Expected ATOMA 115 AFN sandbox product with wholesale price was not found.');
    }
    const product = catalog.rows[0];
    const pricing = await getPricingSettings(client, 'AF');
    const price = calculateFinalPrice({
      wholesalePriceCents: Number(product.wholesale_price_eur_cents),
    }, pricing);

    orderId = createOrderId();
    await client.query(
      `INSERT INTO orders (
         order_id, country, operator, phone, product_id, amount, currency,
         product_price_cents, fee_cents, charge_cents, status, created_at, updated_at
       ) VALUES ($1, 'AF', 'ATOMA-SANDBOX-TEST', '+93700100100', $2, 115, 'AFN',
                 $3, $4, $5, 'awaiting_payment', NOW(), NOW())`,
      [orderId, String(product.id), price.basePriceCents, price.feeCents, price.finalPriceCents]
    );
    await client.query('COMMIT');
    transactionOpen = false;

    const urls = getCheckoutUrls();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: orderId,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'PGNT ASIAN TOPUP — ATOMA sandbox test',
            description: 'Test only. Fixed DT One pre-production recipient.',
          },
          unit_amount: price.finalPriceCents,
        },
        quantity: 1,
      }],
      metadata: { orderId, country: 'AF', productId: String(product.id), sandboxTest: 'true' },
      payment_intent_data: { metadata: { orderId, sandboxTest: 'true' } },
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
    }, { idempotencyKey: `stripe-dtone-sandbox-${orderId}` });

    await pool.query(
      `UPDATE orders SET stripe_session_id = $1, updated_at = NOW()
       WHERE order_id = $2 AND status = 'awaiting_payment'`,
      [session.id, orderId]
    );
    return res.status(201).json({
      sandboxOnly: true,
      orderId,
      checkoutUrl: session.url,
      paymentCurrency: 'EUR',
      amountCents: price.finalPriceCents,
      amountFormatted: formatEuro(price.finalPriceCents),
      recipient: 'fixed DT One pre-production test number ending 100',
      productRemainsInactive: true,
      note: 'Use Stripe test card details only. Successful payment will submit one DT One pre-production sandbox transaction; do not run twice for the same test.',
    });
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Stripe/DT One sandbox checkout setup failed:', error.message);
    return res.status(500).json({ error: 'Could not create sandbox checkout. No product activation was performed.' });
  } finally {
    client.release();
  }
});

// =====================================================
// PART 5/8 — STRIPE WEBHOOK
// MUST be registered BEFORE express.json()
// Payment currency: EUR
// =====================================================

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      return res.status(503).send(
        'Stripe webhook is not configured.'
      );
    }

    const signature =
      req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).send(
        'Missing Stripe signature.'
      );
    }

    let event;

    // Verify the exact raw body from Stripe.
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error(
        'Stripe signature verification failed:',
        error.message
      );

      return res.status(400).send(
        'Invalid Stripe webhook signature.'
      );
    }

    // Persist the Stripe event before processing it. A duplicate event is
    // acknowledged without repeating side effects. If processing fails, remove
    // the claim so Stripe's retry can attempt the event again.
    let webhookEventClaimed = false;
    try {
      const eventClaim = await pool.query(
        `INSERT INTO webhook_events (provider, event_id, payload)
         VALUES ('stripe', $1, $2::jsonb)
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING id`,
        [event.id, JSON.stringify(event)]
      );

      if (eventClaim.rowCount === 0) {
        return res.status(200).json({
          received: true,
          duplicate: true,
        });
      }
      webhookEventClaimed = true;

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;

          // A completed Checkout session does not
          // always mean payment has succeeded.
          if (session.payment_status !== 'paid') {
            return res.status(200).json({
              received: true,
              status: 'awaiting_payment',
            });
          }

          await processPaidStripeSession(session);
          break;
        }

        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object;

          if (session.payment_status === 'paid') {
            await processPaidStripeSession(session);
          }

          break;
        }

        case 'checkout.session.async_payment_failed': {
          const session = event.data.object;

          await markCheckoutPaymentFailed(session);
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;

          await syncStripeRefundStatus(charge);
          break;
        }

        default:
          // Unused Stripe event.
          break;
      }

      return res.status(200).json({
        received: true,
      });
    } catch (error) {
      console.error(
        'Stripe webhook processing failed:',
        event.id,
        error.message
      );

      // Release the event claim only after a failed processing attempt,
      // allowing Stripe to retry safely. Order-level locks and status checks
      // remain the final guard against duplicate fulfillment.
      if (webhookEventClaimed) {
        try {
          await pool.query(
            "DELETE FROM webhook_events WHERE provider = 'stripe' AND event_id = $1",
            [event.id]
          );
        } catch (cleanupError) {
          console.error(
            'Stripe webhook event claim cleanup failed:',
            event.id,
            cleanupError.message
          );
        }
      }

      return res.status(500).json({
        error: 'Webhook processing failed.',
      });
    }
  }
);

// IMPORTANT:
// Move the express.json() line here, AFTER the webhook
// route and BEFORE the Checkout route.
app.use(express.json({ limit: '100kb' }));
// =====================================================
// PART 6/8 — PAID ORDER & DT ONE FULFILLMENT
// Requires Parts 1–5.
// IMPORTANT: Verify DT One API fields against your
// actual DT One account documentation before production.
// =====================================================

const DTONE_TRANSACTION_PATH =
  process.env.DTONE_TRANSACTION_PATH ||
  '/v1/async/transactions';

function getDtOneAuthHeader() {
  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    throw new Error('DT One credentials are not configured.');
  }

  const credentials = Buffer.from(
    `${DTONE_API_KEY}:${DTONE_API_SECRET}`
  ).toString('base64');

  return `Basic ${credentials}`;
}

// Confirm the payment against the saved order.
// Claim the order atomically before calling DT One.
async function processPaidStripeSession(session) {
  if (!pool || !stripe) {
    throw new Error('Payment services are not configured.');
  }

  // Treat the webhook as a trigger, not the final payment record.
  // Re-fetch the Checkout Session from Stripe before any fulfillment so
  // amount, currency, payment intent, metadata, and livemode are canonical.
  if (!session || typeof session.id !== 'string' || !session.id) {
    throw new Error('Stripe webhook session ID is missing.');
  }

  const eventSessionId = session.id;
  session = await stripe.checkout.sessions.retrieve(eventSessionId, {
    expand: ['payment_intent'],
  });

  const paymentIntent = session.payment_intent &&
    typeof session.payment_intent === 'object'
      ? session.payment_intent
      : null;
  const stripeIsTest = STRIPE_SECRET_KEY.startsWith('sk_test_');

  if (
    session.id !== eventSessionId ||
    session.payment_status !== 'paid' ||
    session.currency !== 'eur' ||
    !Number.isSafeInteger(session.amount_total) ||
    !paymentIntent ||
    paymentIntent.status !== 'succeeded' ||
    paymentIntent.currency !== 'eur' ||
    paymentIntent.amount_received !== session.amount_total ||
    session.livemode === stripeIsTest
  ) {
    throw new Error('Canonical Stripe payment verification failed.');
  }

  const orderId = String(
    session.metadata?.orderId ||
    session.client_reference_id ||
    ''
  ).trim();

  if (!orderId) {
    throw new Error('Stripe session has no order ID.');
  }

  const client = await pool.connect();
  let order;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT *
       FROM orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (result.rowCount !== 1) {
      throw new Error('Order not found.');
    }

    order = result.rows[0];

    // A Stripe session must match the session saved
    // for this order; never trust metadata alone.
    if (order.stripe_session_id !== session.id) {
      throw new Error('Stripe session does not match order.');
    }

    if (
      order.currency !== countryCurrency(order.country) ||
      Number(order.charge_cents) !== session.amount_total
    ) {
      throw new Error('Stripe amount/currency mismatch.');
    }

    // Do not trigger fulfillment twice.
    if (
      [
        'processing_topup',
        'topup_submitted',
        'completed',
        'topup_review',
        'refunded',
      ].includes(order.status)
    ) {
      await client.query('COMMIT');
      return { status: order.status, duplicate: true };
    }

    if (order.status !== 'awaiting_payment') {
      throw new Error(
        `Order cannot be fulfilled from status: ${order.status}`
      );
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    await client.query(
      `UPDATE orders
       SET status = 'processing_topup',
           stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
           paid_at = COALESCE(paid_at, NOW()),
           updated_at = NOW()
       WHERE order_id = $1`,
      [orderId, paymentIntentId]
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }

  // Sandbox Stripe orders may use the fixed pre-production product while
  // it remains inactive in the customer catalog. This exception is restricted
  // to an authenticated admin-created test order, Stripe test mode, and the
  // exact DT One pre-production host.
  const isSandboxOrder = order.operator === 'ATOMA-SANDBOX-TEST';
  const sandboxOrderIsSafe =
    isSandboxOrder &&
    STRIPE_SECRET_KEY.startsWith('sk_test_') &&
    isDtOnePreproductionConfigured() &&
    order.country === 'AF' &&
    String(order.phone) === '+93700100100' &&
    Number(order.amount) === 115;

  if (isSandboxOrder && !sandboxOrderIsSafe) {
    await pool.query(
      `UPDATE orders SET status = 'topup_review', updated_at = NOW()
       WHERE order_id = $1 AND status = 'processing_topup'`,
      [orderId]
    );
    throw new Error('Sandbox order failed strict environment/recipient checks.');
  }

  // Re-read trusted product information from the database.
  const product = await pool.query(
    `SELECT product_id AS dtone_product_id, country, currency
     FROM product_catalog
     WHERE id = $1 AND (active = TRUE OR $2::boolean = TRUE)
     LIMIT 1`,
    [order.product_id, sandboxOrderIsSafe]
  );

  if (
    product.rowCount !== 1 ||
    product.rows[0].country !== order.country ||
    product.rows[0].currency !==
      countryCurrency(order.country) ||
    (isSandboxOrder && Number(product.rows[0].dtone_product_id) !== 7194)
  ) {
    await pool.query(
      `UPDATE orders
       SET status = 'topup_review',
           updated_at = NOW()
       WHERE order_id = $1
         AND status = 'processing_topup'`,
      [orderId]
    );

    throw new Error('Product mapping requires review.');
  }

  const phone = normalizePhone(
    order.phone,
    order.country
  );

  // DT One expects the recipient number in international format.
  // Build it from the validated local number and this country's
  // configured calling code; never rely on an undeclared variable.
  const countryConfig = SUPPORTED_COUNTRIES[order.country];
  if (!countryConfig || !countryConfig.callingCode) {
    await pool.query(
      `UPDATE orders
       SET status = 'topup_review',
           updated_at = NOW()
       WHERE order_id = $1
         AND status = 'processing_topup'`,
      [orderId]
    );
    throw new Error('Recipient calling code is not configured.');
  }
  const internationalPhone = `${countryConfig.callingCode}${phone}`;

  // Configure this endpoint and payload to match the
  // exact DT One API version enabled for your account.
  const endpoint =
    `${DTONE_API_BASE_URL}${DTONE_TRANSACTION_PATH}`;

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: getDtOneAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        external_id: orderId,
        product_id: Number(product.rows[0].dtone_product_id),
        credit_party_identifier: {
          mobile_number: internationalPhone,
        },
        auto_confirm: true,
        callback_url: DTONE_CALLBACK_URL,
      }),
    });
  } catch (error) {
    // A timeout does not prove DT One rejected the request.
    // Do not blindly submit it again.
    await pool.query(
      `UPDATE orders
       SET status = 'topup_review',
           updated_at = NOW()
       WHERE order_id = $1
         AND status = 'processing_topup'`,
      [orderId]
    );

    throw new Error(
      'DT One outcome is unknown; manual/status review required.'
    );
  }

  const responseText = await response.text();
  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    // Preserve an uncertain state for review rather than
    // automatically repeating a potentially accepted order.
    await pool.query(
      `UPDATE orders
       SET status = 'topup_review',
           updated_at = NOW()
       WHERE order_id = $1
         AND status = 'processing_topup'`,
      [orderId]
    );

    console.error(
      'DT One request returned an error:',
      response.status
    );

    throw new Error('DT One request needs review.');
  }

  // A successful HTTP response may mean "accepted",
  // not necessarily "delivered".
  // Save the provider reference for callback/status handling.
  // Store only DT One's own transaction reference here.
  // external_id is our order ID, not a provider transaction ID.
  const providerReference =
    data.id ||
    data.transaction_id ||
    null;

  await pool.query(
    `UPDATE orders
     SET status = 'topup_submitted',
         dtone_transaction_id = $1,
         updated_at = NOW()
     WHERE order_id = $2
       AND status = 'processing_topup'`,
    [providerReference, orderId]
  );

  return {
    status: 'topup_submitted',
    orderId,
    providerReference,
  };
}
// =====================================================
// PART 7/8 — DT ONE CALLBACK, FAILURE REVIEW & REFUNDS
// Customer payment currency: EUR
// =====================================================

// DT One Shop provides callback credentials (username/password) for
// authenticating status callbacks. Configure these in Render from the
// PRE-PRODUCTION callback credentials. Keep the legacy shared-header
// secret only as an explicitly configured fallback.
const DTONE_CALLBACK_USERNAME =
  process.env.DTONE_CALLBACK_USERNAME || '';
const DTONE_CALLBACK_PASSWORD =
  process.env.DTONE_CALLBACK_PASSWORD || '';
const DTONE_CALLBACK_SECRET =
  process.env.DTONE_CALLBACK_SECRET || '';

// Normalize only recognized provider status values.
// Confirm the exact values used by your DT One API.
function normalizeDtOneStatus(value) {
  // DT One DVS callbacks commonly provide status as an object:
  // { id: 7, message: "COMPLETED", class: { ... } }.
  // Also accept a plain string for compatible API versions.
  const rawStatus =
    value && typeof value === 'object'
      ? (value.message || value.status || '')
      : value;
  const status = String(rawStatus || '')
    .trim()
    .toLowerCase();

  if (['completed', 'successful', 'succeeded'].includes(status)) {
    return 'completed';
  }

  if (['rejected', 'cancelled', 'canceled', 'declined', 'failed'].includes(status)) {
    return 'failed';
  }

  if (['pending', 'processing', 'accepted', 'created', 'confirmed', 'submitted'].includes(status)) {
    return 'pending';
  }

  // REVERSED is a distinct post-completion status. Treat it as a
  // failure requiring review/refund assessment, never as delivered.
  if (status === 'reversed') {
    return 'failed';
  }

  return 'unknown';
}

// Callback authentication fails closed. Prefer HTTP Basic credentials
// configured in DT Shop; retain the legacy shared-header adapter only
// for accounts explicitly configured to send that header.
function constantTimeEqual(supplied, expected) {
  const suppliedBuffer = Buffer.from(String(supplied || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return (
    expectedBuffer.length > 0 &&
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function verifyDtOneCallback(req) {
  const authorization = String(req.headers.authorization || '');

  // When Basic callback credentials are configured, use them exclusively.
  // Do not fall back to the legacy shared-header secret when a caller sends
  // missing, malformed, or incorrect Basic credentials.
  if (DTONE_CALLBACK_USERNAME || DTONE_CALLBACK_PASSWORD) {
    if (
      !DTONE_CALLBACK_USERNAME ||
      !DTONE_CALLBACK_PASSWORD ||
      !authorization.startsWith('Basic ')
    ) {
      return false;
    }

    const encodedCredentials = authorization.slice(6).trim();
    if (!encodedCredentials || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedCredentials)) {
      return false;
    }

    let decoded = '';
    try {
      decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
    } catch (_) {
      return false;
    }

    // Reject malformed/non-canonical base64 rather than accepting Node's
    // permissive decoder behavior.
    if (Buffer.from(decoded, 'utf8').toString('base64') !== encodedCredentials) {
      return false;
    }

    const separator = decoded.indexOf(':');
    if (separator < 0) return false;

    const suppliedUsername = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);
    return (
      constantTimeEqual(suppliedUsername, DTONE_CALLBACK_USERNAME) &&
      constantTimeEqual(suppliedPassword, DTONE_CALLBACK_PASSWORD)
    );
  }

  // Legacy shared-header auth is used only when Basic credentials are not
  // configured at all, and only when its own secret is configured.
  if (DTONE_CALLBACK_SECRET) {
    return constantTimeEqual(
      req.headers['x-pgnt-callback-secret'],
      DTONE_CALLBACK_SECRET
    );
  }

  return false;
}

// DT One transaction callback.
// Do not expose this route until the callback
// authentication adapter matches DT One's real protocol.
// Read-only DT One status lookup for diagnosis. Does not create, retry, or modify a top-up.
app.get('/api/admin/dtone/transaction-status', requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database is not configured.' });
  }

  const externalId = String(req.query.external_id || '').trim();
  if (!externalId || externalId.length > 40 || /\\s/.test(externalId)) {
    return res.status(400).json({ error: 'A valid external_id is required.' });
  }

  try {
    const local = await pool.query(
      `SELECT order_id, status, dtone_transaction_id, updated_at
       FROM orders
       WHERE order_id::text = $1
       LIMIT 1`,
      [externalId]
    );

    const endpoint = `${DTONE_API_BASE_URL}/v1/transactions?external_id=${encodeURIComponent(externalId)}`;
    let response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: getDtOneAuthHeader(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    // DT One may return 404 for an external_id query even when the local
    // order already stores the provider transaction ID. In that case, retry
    // the read-only lookup by DT One's transaction ID; never create/resubmit.
    if (response.status === 404 && local.rows[0]?.dtone_transaction_id) {
      const providerTransactionId = String(local.rows[0].dtone_transaction_id);
      if (/^\\d+$/.test(providerTransactionId)) {
        response = await fetch(
          `${DTONE_API_BASE_URL}/v1/transactions/${encodeURIComponent(providerTransactionId)}`,
          {
            method: 'GET',
            headers: {
              Authorization: getDtOneAuthHeader(),
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          }
        );
      }
    }

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (_) {
      return res.status(502).json({ error: 'DT One returned a non-JSON response.', providerHttpStatus: response.status });
    }

    if (!response.ok) {
      console.warn('DT One read-only status lookup failed.', { providerHttpStatus: response.status });
      return res.status(502).json({
        error: 'DT One status lookup failed.',
        providerHttpStatus: response.status,
      });
    }

    const transactions = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.transactions)
          ? data.transactions
          : data && typeof data === 'object' && data.id
            ? [data]
            : [];

    const safeTransactions = transactions.map((tx) => ({
      id: tx.id ?? null,
      external_id: tx.external_id ?? null,
      status: tx.status?.message || tx.status?.status || tx.status || null,
      status_class: tx.status?.class?.message || null,
      creation_date: tx.creation_date ?? null,
      confirmation_date: tx.confirmation_date ?? null,
    }));

    return res.status(200).json({
      lookup: 'read_only',
      providerHttpStatus: response.status,
      localOrder: local.rows[0] || null,
      transactionCount: safeTransactions.length,
      transactions: safeTransactions,
    });
  } catch (error) {
    console.error('DT One read-only status lookup error.', {
      errorName: error?.name || 'Error',
    });
    return res.status(502).json({ error: 'Could not complete DT One status lookup.' });
  }
});

app.post('/api/dtone/callback', async (req, res) => {
  // Safe receipt telemetry: no credentials, phone numbers, order IDs, or payloads.
  console.info('DT One callback received.', {
    method: req.method,
    contentType: String(req.headers['content-type'] || '').slice(0, 80),
    authorizationScheme: String(req.headers.authorization || '').split(/\s+/, 1)[0] || 'missing',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 120),
  });

  if (!pool) {
    return res.status(503).json({
      error: 'Database is not configured.',
    });
  }

  if (!verifyDtOneCallback(req)) {
    // Log only safe diagnostic metadata; never log credentials or callback payloads.
    console.warn('DT One callback authentication rejected.', {
      authorizationScheme: String(req.headers.authorization || '').split(/\s+/, 1)[0] || 'missing',
      basicUsernameConfigured: Boolean(DTONE_CALLBACK_USERNAME),
      basicPasswordConfigured: Boolean(DTONE_CALLBACK_PASSWORD),
      sharedHeaderSecretConfigured: Boolean(DTONE_CALLBACK_SECRET),
      hasSharedSecretHeader: Boolean(req.headers['x-pgnt-callback-secret']),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 120),
    });
    return res.status(401).json({
      error: 'Callback authentication failed.',
    });
  }

  const body = req.body || {};

  const orderId = String(
    body.external_id || body.order_id || ''
  ).trim();

  const providerTransactionId = String(
    body.transaction_id || body.id || ''
  ).trim();

  const providerStatus = normalizeDtOneStatus(
    body.status
  );

  console.info('DT One callback authenticated.', {
    hasOrderId: Boolean(orderId),
    hasProviderTransactionId: Boolean(providerTransactionId),
    normalizedStatus: providerStatus,
  });
  // Store a compact provider status label in VARCHAR(80).
  // Preserve the complete provider payload separately as JSONB.
  const storedProviderStatus = typeof body.status === 'string'
    ? body.status
    : String(
        body.status?.message ||
        body.status?.status ||
        JSON.stringify(body.status ?? 'unknown')
      ).slice(0, 80);

  if (!orderId || !providerTransactionId) {
    return res.status(400).json({
      error: 'Missing transaction reference.',
    });
  }

  if (providerStatus === 'unknown') {
    return res.status(400).json({
      error: 'Unrecognized transaction status.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT *
       FROM orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (result.rowCount !== 1) {
      await client.query('ROLLBACK');
      console.warn('DT One callback order not found.', {
        hasOrderId: Boolean(orderId),
        hasProviderTransactionId: Boolean(providerTransactionId),
      });

      return res.status(404).json({
        error: 'Order not found.',
      });
    }

    const order = result.rows[0];

    // A provider callback must never move an order unless the Stripe
    // fulfillment path has already verified payment and saved its evidence.
    // This also protects legacy/review orders with missing payment linkage.
    if (!order.paid_at || !order.stripe_payment_intent_id) {
      await client.query('ROLLBACK');
      console.warn('DT One callback rejected: verified Stripe payment evidence is missing.', {
        hasPaidAt: Boolean(order.paid_at),
        hasStripePaymentIntentId: Boolean(order.stripe_payment_intent_id),
      });
      return res.status(409).json({
        error: 'Order has no verified Stripe payment evidence.',
      });
    }

    // If an existing provider reference is stored,
    // it must match the callback reference.
    if (
      order.dtone_transaction_id &&
      String(order.dtone_transaction_id) !==
        providerTransactionId
    ) {
      await client.query('ROLLBACK');
      console.warn('DT One callback transaction reference mismatch.', {
        orderHasProviderReference: Boolean(order.dtone_transaction_id),
        callbackHasProviderReference: Boolean(providerTransactionId),
      });

      return res.status(409).json({
        error: 'Transaction reference mismatch.',
      });
    }

    // Keep referral reward reconciliation idempotent and reusable for duplicate
    // successful callbacks. A completed top-up must not silently skip a missing reward.
    const ensureReferralRewardRecorded = async (completedOrder) => {
      // Retired ordinary-customer referral program: keep historical ledger rows,
      // but do not create, promote, or reconcile new ordinary referral rewards.
      return false;
      if (!completedOrder.referral_code || !completedOrder.referral_install_id) return false;

      const referral = await client.query(
        `SELECT code, reward_eur_cents, max_rewards
         FROM referral_codes WHERE code = $1 FOR UPDATE`,
        [completedOrder.referral_code]
      );
      if (referral.rowCount !== 1 || Number(referral.rows[0].reward_eur_cents) <= 0) {
        console.warn('Completed top-up referral reward needs review: referral code or reward is unavailable.', {
          hasReferralCode: Boolean(completedOrder.referral_code),
        });
        return false;
      }

      // Treat an already active ledger entry for this order/install as success.
      // This prevents a duplicate callback from consuming another cap slot.
      const existing = await client.query(
        `SELECT id FROM referral_ledger
         WHERE order_id = $1 AND install_id_hash = $2 AND referral_code = $3
           AND status IN ('pending','approved','paid')
         LIMIT 1`,
        [orderId, completedOrder.referral_install_id, completedOrder.referral_code]
      );
      let rewardRecorded = existing.rowCount === 1;

      if (!rewardRecorded) {
        const reservation = await client.query(
          `UPDATE referral_ledger
           SET status = 'pending', updated_at = NOW()
           WHERE order_id = $1 AND install_id_hash = $2
             AND referral_code = $3 AND status = 'reserved'
           RETURNING id`,
          [orderId, completedOrder.referral_install_id, completedOrder.referral_code]
        );
        rewardRecorded = reservation.rowCount === 1;
      }

      if (!rewardRecorded) {
        const cap = referral.rows[0].max_rewards;
        const used = await client.query(
          `SELECT COUNT(*)::int AS count FROM referral_ledger
           WHERE referral_code = $1 AND status IN ('reserved','pending','approved','paid')`,
          [completedOrder.referral_code]
        );
        if (cap === null || Number(used.rows[0].count) < Number(cap)) {
          const ledgerInsert = await client.query(
            `INSERT INTO referral_ledger
               (referral_code, install_id_hash, order_id, reward_eur_cents, status)
             VALUES ($1, $2, $3, $4, 'pending')
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [completedOrder.referral_code, completedOrder.referral_install_id, orderId,
             Number(referral.rows[0].reward_eur_cents)]
          );
          rewardRecorded = ledgerInsert.rowCount === 1;
        }
      }

      if (rewardRecorded) {
        await client.query(
          `UPDATE referral_attributions
           SET first_paid_at = COALESCE(first_paid_at, NOW()),
               first_order_id = COALESCE(first_order_id, $1)
           WHERE install_id_hash = $2 AND referral_code = $3`,
          [orderId, completedOrder.referral_install_id, completedOrder.referral_code]
        );
      } else {
        // Do not roll back an already-delivered top-up, but make reward loss visible.
        console.error('Referral reward reconciliation required for completed top-up.', {
          orderId,
          referralCode: completedOrder.referral_code,
          reason: 'reservation missing, cap reached, or active-install conflict',
        });
      }
      return rewardRecorded;
    };

    // DT One may retry a callback if the earlier HTTP response was lost.
    // A repeat notification for an already completed matching transaction
    // is safe to acknowledge with HTTP 200 without changing the order.
    if (order.status === 'completed') {
      // Only a repeated final-success callback may repair a missing reward.
      // Stale pending/failed callbacks must never downgrade a completed order.
      let referralRewardRecorded = null;
      if (providerStatus === 'completed') {
        referralRewardRecorded = await ensureReferralRewardRecorded(order);
      }
      await client.query('COMMIT');
      return res.status(200).json({
        received: true,
        orderId,
        status: 'completed',
        duplicate: true,
        ...(referralRewardRecorded === null ? {} : { referralRewardRecorded }),
      });
    }

    // Never allow a callback to change an order
    // that was not submitted to DT One.
    if (
      ![
        'topup_submitted',
        'processing_topup',
        'topup_review',
      ].includes(order.status)
    ) {
      await client.query('ROLLBACK');
      console.warn('DT One callback order is not awaiting provider status.', {
        currentOrderStatus: String(order.status || 'unknown'),
        normalizedProviderStatus: providerStatus,
      });

      return res.status(409).json({
        error: 'Order is not awaiting DT One status.',
      });
    }

    let nextStatus;

    if (providerStatus === 'completed') {
      nextStatus = 'completed';
    } else if (providerStatus === 'failed') {
      // A provider failure is not itself a Stripe refund.
      // Keep the order under review until refund handling
      // has been verified by an authorized operator.
      nextStatus = 'topup_review';
    } else {
      // A delayed "pending" callback must not downgrade an order
      // already escalated to review because its outcome is ambiguous.
      // Keep it in review until a final provider status is received.
      nextStatus = order.status === 'topup_review'
        ? 'topup_review'
        : 'topup_submitted';
    }

    await client.query(
      `UPDATE orders
       SET status = $1,
           dtone_transaction_id = $2,
           dtone_status = $3,
           dtone_callback_payload = $4::jsonb,
           completed_at = CASE
             WHEN $1 = 'completed' THEN COALESCE(completed_at, NOW())
             ELSE completed_at
           END,
           failed_at = CASE
             WHEN $5 = 'failed' THEN COALESCE(failed_at, NOW())
             ELSE failed_at
           END,
           updated_at = NOW()
       WHERE order_id = $6`,
      [
        nextStatus,
        providerTransactionId,
        storedProviderStatus.slice(0, 80),
        JSON.stringify(body),
        providerStatus,
        orderId,
      ]
    );

    // Legacy customer rewards remain retired; influencer rewards are separate and pending admin approval.
    if (nextStatus === 'completed' && order.influencer_campaign_id && order.influencer_install_hash) {
      const firstPaid = await client.query(
        'UPDATE influencer_attributions SET first_paid_order_id = $1, first_paid_at = COALESCE(first_paid_at, NOW()) WHERE install_hash = $2 AND campaign_id = $3 AND first_paid_order_id IS NULL RETURNING id',
        [orderId, order.influencer_install_hash, order.influencer_campaign_id]
      );
      if (firstPaid.rowCount === 1) {
        const campaignReward = await client.query('SELECT reward_eur_cents FROM influencer_campaigns WHERE id = $1 FOR UPDATE', [order.influencer_campaign_id]);
        const rewardCents = Number(campaignReward.rows[0]?.reward_eur_cents || 0);
        if (rewardCents > 0) {
          await client.query(
            "INSERT INTO influencer_rewards (campaign_id, attribution_id, order_id, reward_eur_cents, status) VALUES ($1,$2,$3,$4,'pending') ON CONFLICT DO NOTHING",
            [order.influencer_campaign_id, firstPaid.rows[0].id, orderId, rewardCents]
          );
        }
      }
    }
    // Record/reconcile the retired legacy path only as a no-op; do not grant customer rewards.
    if (nextStatus === 'completed') await ensureReferralRewardRecorded(order);

    await client.query('COMMIT');
    console.info('DT One callback order updated.', {
      previousOrderStatus: String(order.status || 'unknown'),
      nextOrderStatus: nextStatus,
      normalizedProviderStatus: providerStatus,
      hasProviderTransactionId: Boolean(providerTransactionId),
    });

    return res.status(200).json({
      received: true,
      orderId,
      status: nextStatus,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}

    console.error(
      'DT One callback processing failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Could not process callback.',
    });
  } finally {
    client.release();
  }
});

// Mark a failed asynchronous Stripe payment only when
// the stored session matches and the order is still unpaid.
async function markCheckoutPaymentFailed(session) {
  if (!pool || !session?.id) {
    throw new Error('Invalid failed payment event.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changed = await client.query(
      `UPDATE orders
       SET status = 'payment_failed', updated_at = NOW()
       WHERE stripe_session_id = $1 AND status = 'awaiting_payment'
       RETURNING order_id`,
      [session.id]
    );
    if (changed.rowCount === 1) {
      await client.query(
        `UPDATE referral_ledger SET status = 'reversed', updated_at = NOW()
         WHERE order_id = $1 AND status = 'reserved'`,
        [changed.rows[0].order_id]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

// Record refund state only when the Stripe charge
// identifies a known payment for an order.
// This does not initiate a refund.
async function syncStripeRefundStatus(charge) {
  if (!pool || !charge?.payment_intent) {
    throw new Error(
      'Cannot identify the refunded payment.'
    );
  }

  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent.id;

  const refundObject =
    Array.isArray(charge.refunds?.data) &&
    charge.refunds.data.length > 0
      ? charge.refunds.data[charge.refunds.data.length - 1]
      : null;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT order_id, status
       FROM orders
       WHERE stripe_payment_intent_id = $1
       FOR UPDATE`,
      [paymentIntentId]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      console.warn(
        'Refund received but no matching order was found.'
      );
      return;
    }

    const order = orderResult.rows[0];
    const fullRefund = charge.refunded === true;
    const refundStatus = fullRefund
      ? 'succeeded'
      : 'partial';

    // Never overwrite a successful DT One fulfillment
    // status automatically; route financial discrepancies for review.
    if (order.status !== 'completed') {
      await client.query(
        `UPDATE orders
         SET status = CASE
           WHEN $1 = TRUE THEN 'refunded'
           ELSE 'topup_review'
         END,
         refunded_at = CASE
           WHEN $1 = TRUE THEN COALESCE(refunded_at, NOW())
           ELSE refunded_at
         END,
         updated_at = NOW()
         WHERE order_id = $2`,
        [fullRefund, order.order_id]
      );
    } else {      console.warn(
        'Stripe refund observed for a completed top-up; order retained for manual reconciliation.',
        order.order_id
      );
    }

    // Keep the refunds ledger in sync with Stripe webhook truth.
    // A refund can have originated from the Stripe Dashboard.
    await client.query(
      `INSERT INTO refunds (
         order_id, stripe_refund_id, amount_cents, status, reason
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id)
       DO UPDATE SET
         stripe_refund_id = COALESCE(EXCLUDED.stripe_refund_id, refunds.stripe_refund_id),
         amount_cents = EXCLUDED.amount_cents,
         status = EXCLUDED.status,
         reason = COALESCE(EXCLUDED.reason, refunds.reason)`,
      [
        order.order_id,
        refundObject?.id || null,
        Number(charge.amount_refunded || 0),
        refundStatus,
        fullRefund
          ? 'Stripe webhook confirmed full refund'
          : 'Stripe webhook reported partial refund; manual review required',
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}
// =====================================================
// PART 8/8 — ADMIN SECURITY & SERVER STARTUP
// PGNT ASIAN TOPUP
// Customer payment currency: EUR
// =====================================================

// Admin authentication.
// Set a long, random ADMIN_API_KEY in Render.
function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({
      error: 'Admin authentication is not configured.',
    });
  }

  const suppliedKey = String(
    req.headers['x-admin-api-key'] || ''
  );

  const expected = Buffer.from(ADMIN_API_KEY);
  const supplied = Buffer.from(suppliedKey);

  const valid =
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied);

  if (!valid) {
    return res.status(401).json({
      error: 'Unauthorized.',
    });
  }

  return next();
}

// Admin-managed influencer campaigns are isolated from retired customer referrals.
require('./influencer-routes')({ app, pool, requireAdmin, appBaseUrl: APP_BASE_URL });

// Customer and admin support-ticket API routes. These use per-order access
// tokens for customer requests and the existing ADMIN_API_KEY for admin actions.
require('./support-routes')({
  app,
  pool,
  requireAdmin,
});



// Small browser page for the owner to run the read-only product check
// without installing an API client. The admin key is entered by the owner
// in their browser and is never stored by this page.
// REFERRAL REWARDS V1 — ADMIN CONTROL + SERVER-SIDE ATTRIBUTION
// All new referral codes are disabled until explicitly activated by admin.
// =====================================================
app.post('/api/admin/referrals/codes', requireAdmin, async (req, res) => {
  return res.status(410).json({ error: 'Ordinary-customer referral rewards are retired. Use admin-managed influencer campaigns instead.' });
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const body = req.body || {};
  const code = String(body.code || '').trim().toUpperCase();
  const ownerName = String(body.ownerName || '').trim();
  const ownerContact = String(body.ownerContact || '').trim() || null;
  const rewardEurCents = body.rewardEurCents === undefined ? 7 : Number(body.rewardEurCents);
  const maxRewards = body.maxRewards === undefined || body.maxRewards === null || body.maxRewards === '' ? null : Number(body.maxRewards);
  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return res.status(400).json({ error: 'Code must be 4-40 characters: letters, numbers, _ or -.' });
  if (!ownerName || ownerName.length > 120) return res.status(400).json({ error: 'A valid ownerName is required.' });
  if (!Number.isSafeInteger(rewardEurCents) || rewardEurCents < 0 || rewardEurCents > 10000) return res.status(400).json({ error: 'rewardEurCents must be 0-10000.' });
  if (maxRewards !== null && (!Number.isSafeInteger(maxRewards) || maxRewards < 0)) return res.status(400).json({ error: 'maxRewards must be a non-negative integer.' });
  try {
    const result = await pool.query(
      `INSERT INTO referral_codes (code, owner_name, owner_contact, reward_eur_cents, max_rewards, active)
       VALUES ($1,$2,$3,$4,$5,FALSE)
       RETURNING code, owner_name, owner_contact, reward_eur_cents, max_rewards, active, created_at`,
      [code, ownerName, ownerContact, rewardEurCents, maxRewards]
    );
    return res.status(201).json({ referral: result.rows[0], activationRequired: true });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Referral code already exists.' });
    console.error('Referral code creation failed:', error.message);
    return res.status(500).json({ error: 'Could not create referral code.' });
  }
});

app.get('/api/admin/referrals', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  try {
    const result = await pool.query(`
      SELECT c.code, c.owner_name, c.owner_contact, c.reward_eur_cents, c.max_rewards, c.active, c.created_at,
        (SELECT COUNT(*) FROM referral_attributions a WHERE a.referral_code=c.code) AS attributed_installs,
        (SELECT COUNT(*) FROM referral_ledger l WHERE l.referral_code=c.code AND l.status IN ('pending','approved','paid')) AS reward_eligible,
        (SELECT COALESCE(SUM(l.reward_eur_cents),0) FROM referral_ledger l WHERE l.referral_code=c.code AND l.status IN ('pending','approved','paid')) AS reward_total_eur_cents,
        (SELECT COUNT(*) FROM referral_ledger l WHERE l.referral_code=c.code AND l.status='paid') AS rewards_paid
      FROM referral_codes c ORDER BY c.created_at DESC`);
    return res.json({ referrals: result.rows, rewardRule: '€0.07 after the referred user completes their first successful top-up; reward entries remain pending until admin approval.' });
  } catch (error) {
    console.error('Referral report failed:', error.message);
    return res.status(500).json({ error: 'Could not load referral report.' });
  }
});

app.patch('/api/admin/referrals/codes/:code', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });

  const code = String(req.params.code || '').trim().toUpperCase();
  const body = req.body || {};
  const fields = [];
  const values = [code];

  if (typeof body.active === 'boolean') {
    values.push(body.active);
    fields.push(`active = $${values.length}`);
  }

  if (body.rewardEurCents !== undefined) {
    const reward = Number(body.rewardEurCents);
    if (!Number.isSafeInteger(reward) || reward < 0 || reward > 10000) {
      return res.status(400).json({ error: 'rewardEurCents must be 0-10000.' });
    }
    values.push(reward);
    fields.push(`reward_eur_cents = $${values.length}`);
  }

  if (body.maxRewards !== undefined) {
    const max = body.maxRewards === null || body.maxRewards === '' ? null : Number(body.maxRewards);
    if (max !== null && (!Number.isSafeInteger(max) || max < 0)) {
      return res.status(400).json({ error: 'maxRewards must be a non-negative integer or null.' });
    }
    values.push(max);
    fields.push(`max_rewards = $${values.length}`);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Provide active, rewardEurCents, or maxRewards.' });
  }

  try {
    const result = await pool.query(
      `UPDATE referral_codes SET ${fields.join(', ')} WHERE code = $1
       RETURNING code, owner_name, owner_contact, reward_eur_cents, max_rewards, active, created_at`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Referral code not found.' });
    return res.json({ referral: result.rows[0] });
  } catch (error) {
    console.error('Referral code update failed:', error.message);
    return res.status(500).json({ error: 'Could not update referral code.' });
  }
});

app.get('/admin-dtone-check', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PGNT ASIAN — DT One product check</title>
<style>
body{font:16px system-ui,sans-serif;max-width:620px;margin:32px auto;padding:0 16px;color:#222}
h1{font-size:1.35rem}label{display:block;margin:18px 0 6px}
input,button{box-sizing:border-box;width:100%;padding:12px;font:inherit}
button{margin-top:14px;background:#7a0c10;color:white;border:0;border-radius:6px}
.ticket-card{border:1px solid #ddd;border-radius:8px;padding:14px;margin:14px 0;background:#fff}.ticket-card h3{font-size:1.05rem}.ticket-card label{margin:12px 0 6px}.ticket-card textarea{display:block}.ticket-card button{margin-top:12px}
small{color:#555}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:12px;border-radius:6px}
</style>
</head>
<body>
<h1>PGNT ASIAN TOPUP</h1>
<p>Read-only DT One check for Afghanistan ATOMA, product 7194 (115 AFN). This does not create a top-up or enable the product.</p>
<form id="check">
<label for="key">Admin API key</label>
<input id="key" type="password" autocomplete="off" required>
<small>The key is sent only to this PGNT backend for this request and is not saved by this page. Do not share it in chat or screenshots.</small>
<button type="submit">Verify product 7194</button><button type="button" id="checkDatabase">Verify database price and fees (read-only)</button><button type="button" id="discover">Find Afghanistan ATOMA products</button>
<hr>
<h2>Sandbox transaction test</h2>
<p>This uses DT One pre-production only. It does not charge a customer or activate a product. Run only after confirming this is your sandbox account.</p>
<label for="scenario">Test result</label>
<select id="scenario" style="width:100%;padding:12px;font:inherit"><option value="completed">Successful scenario (test number ending 100)</option><option value="declined">Declined scenario (test number ending 106)</option></select>
<label style="display:flex;gap:8px;align-items:center"><input id="confirmSandbox" type="checkbox" style="width:auto"> I confirm this is a DT One SANDBOX test</label>
<button type="button" id="runSandbox">Run sandbox transaction</button>
<label for="orderId">Sandbox test order ID (for status lookup)</label>
<input id="orderId" autocomplete="off" placeholder="Paste orderId from the result">
<label for="stripeSessionId">Stripe Checkout Session ID (optional; from Stripe event)</label>
<input id="stripeSessionId" autocomplete="off" placeholder="cs_test_… or cs_live_…">
<button type="button" id="checkSandboxStatus">Check saved order status</button><button type="button" id="checkStripePaymentStatus">Check Stripe payment status (read-only)</button><button type="button" id="checkLiveDtOneStatus">Query DT One live status (read-only)</button><small>This queries DT One directly for the entered external/order ID. It does not create, retry, or modify a transaction.</small>
<button type="button" id="loadReviewQueue">Load admin review queue (read-only)</button>
</form>
<hr>
<h2>Stripe + DT One end-to-end sandbox</h2>
<p>Admin-only test. Uses Stripe test mode and DT One pre-production with a fixed test recipient. A successful test payment submits one sandbox top-up. It does not activate the ATOMA catalog product. Do not use real card details.</p>
<label style="display:flex;gap:8px;align-items:center"><input id="confirmStripeDtoneSandbox" type="checkbox" style="width:auto"> I confirm this is a Stripe TEST + DT One PRE-PRODUCTION test</label>
<button type="button" id="runStripeDtoneSandbox">Create test checkout</button>
<h2>Admin pricing controls</h2>
<p>Choose any supported country to manage its EUR app fee, local-currency reference rate, and estimated Stripe fees. Reference exchange rates are indicative and must be checked before production. Keep unverified products disabled.</p>
<label for="pricingCountry">Country pricing</label><select id="pricingCountry" style="width:100%;padding:12px;font:inherit"><option value="AF">Afghanistan (AFN)</option><option value="PK">Pakistan (PKR)</option><option value="IN">India (INR)</option><option value="BD">Bangladesh (BDT)</option></select>
<button type="button" id="loadPricing">Load selected country settings</button>
<label for="feeEur">App fee (EUR)</label><input id="feeEur" type="number" min="0" max="1000" step="0.01" value="0.79">
<label id="localRateLabel" for="afnRate">Local currency units per EUR</label><input id="afnRate" type="number" min="0.01" step="0.0001" value="72.8325">
<label for="bonusPercent">Legacy general bonus (removed; referral rewards are separate)</label><input id="bonusPercent" type="number" min="0" max="100" step="0.01" value="0" disabled>
<label for="stripeFeePercent">Estimated Stripe fee percent</label><input id="stripeFeePercent" type="number" min="0" max="99.99" step="0.001" value="1.5">
<label for="stripeFixedFee">Estimated Stripe fixed fee (EUR)</label><input id="stripeFixedFee" type="number" min="0" max="100" step="0.01" value="0.25">
<label style="display:flex;gap:8px;align-items:center"><input id="pricingActive" type="checkbox" style="width:auto"> Selected country pricing settings active</label>
<button type="button" id="savePricing">Save selected country pricing settings</button>
<small>Save changes country pricing settings only. This does not activate the ATOMA product or perform a payment. Check the displayed values before saving.</small>
<h2>Customer Support Tickets</h2>
<p>Review customer requests, prioritize urgent issues, reply to customers, and update ticket status. This page does not issue refunds or change payment/top-up outcomes.</p>
<label for="ticketStatusFilter">Ticket status filter</label>
<select id="ticketStatusFilter" style="width:100%;padding:12px;font:inherit">
<option value="">All tickets</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
</select>
<button type="button" id="loadSupportTickets">Load / refresh support tickets</button>
<div id="supportTickets" aria-live="polite"></div>
<h2>Result</h2><pre id="result">Waiting for verification.</pre>
<script>
const form=document.getElementById('check');
const key=document.getElementById('key');
const result=document.getElementById('result');
const discover=document.getElementById('discover');
const checkDatabase=document.getElementById('checkDatabase');
const scenario=document.getElementById('scenario');
const confirmSandbox=document.getElementById('confirmSandbox');
const runSandbox=document.getElementById('runSandbox');
const orderId=document.getElementById('orderId');
const stripeSessionId=document.getElementById('stripeSessionId');
const checkSandboxStatus=document.getElementById('checkSandboxStatus');
const checkStripePaymentStatus=document.getElementById('checkStripePaymentStatus');
const checkLiveDtOneStatus=document.getElementById('checkLiveDtOneStatus');
const loadReviewQueue=document.getElementById('loadReviewQueue');
const loadPricing=document.getElementById('loadPricing');
const savePricing=document.getElementById('savePricing');
const confirmStripeDtoneSandbox=document.getElementById('confirmStripeDtoneSandbox');
const runStripeDtoneSandbox=document.getElementById('runStripeDtoneSandbox');
const feeEur=document.getElementById('feeEur');
const pricingCountry=document.getElementById('pricingCountry');
const localRateLabel=document.getElementById('localRateLabel');
const countryCurrencies={AF:'AFN',PK:'PKR',IN:'INR',BD:'BDT'};
const afnRate=document.getElementById('afnRate');
const bonusPercent=document.getElementById('bonusPercent');
const stripeFeePercent=document.getElementById('stripeFeePercent');
const stripeFixedFee=document.getElementById('stripeFixedFee');
const pricingActive=document.getElementById('pricingActive');
let loadedCountryPricing=null;
pricingCountry.addEventListener('change',()=>{localRateLabel.textContent=countryCurrencies[pricingCountry.value]+' per EUR exchange rate';loadedCountryPricing=null;});

async function adminRequest(url,options={}){
 const response=await fetch(url,{...options,headers:{...(options.headers||{}),'x-admin-api-key':key.value},cache:'no-store'});
 const raw=await response.text();
 let data;
 try{data=raw?JSON.parse(raw):{};}catch(_){
  const preview=raw.replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').trim().slice(0,220);
  throw new Error('Backend returned non-JSON response (HTTP '+response.status+'). '+(preview||'Empty response'));
 }
 if(!response.ok) throw new Error('HTTP '+response.status+': '+JSON.stringify(data));
 return data;
}

const ticketStatusFilter=document.getElementById('ticketStatusFilter');
const loadSupportTickets=document.getElementById('loadSupportTickets');
const supportTickets=document.getElementById('supportTickets');
function makeTicketElement(tag, text, className){
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(className)node.className=className;
 return node;
}
async function refreshSupportTickets(){
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 supportTickets.replaceChildren(makeTicketElement('p','Loading support tickets…'));
 loadSupportTickets.disabled=true;
 try{
  const status=ticketStatusFilter.value;
  const data=await adminRequest('/api/admin/support/tickets?limit=100'+(status?'&status='+encodeURIComponent(status):''));
  supportTickets.replaceChildren();
  const tickets=Array.isArray(data.tickets)?data.tickets:[];
  if(!tickets.length){supportTickets.append(makeTicketElement('p','No tickets found for this filter.'));return;}
  for(const ticket of tickets){
   const card=makeTicketElement('section',undefined,'ticket-card');
   card.append(makeTicketElement('h3','#'+ticket.id+' — '+(ticket.subject||'Support request')));
   card.append(makeTicketElement('p','Status: '+ticket.status+' | Priority: '+ticket.priority+' | Category: '+ticket.category));
   card.append(makeTicketElement('p','Order: '+ticket.order_id+' | '+(ticket.country||'')+' '+(ticket.operator||'')+' | Phone: '+(ticket.phone||'')+' | Order status: '+(ticket.order_status||'unknown')));
   card.append(makeTicketElement('p','Customer message: '+(ticket.message||'')));
   card.append(makeTicketElement('small','Created: '+(ticket.created_at||'—')));
   const statusLabel=makeTicketElement('label','Update status');
   const statusSelect=document.createElement('select');
   statusSelect.style.cssText='width:100%;padding:10px;font:inherit';
   for(const option of [['open','Open'],['in_progress','In progress'],['resolved','Resolved'],['closed','Closed']]){
    const item=document.createElement('option');item.value=option[0];item.textContent=option[1];item.selected=ticket.status===option[0];statusSelect.append(item);
   }
   statusLabel.append(statusSelect);card.append(statusLabel);
   const priorityLabel=makeTicketElement('label','Priority');
   const prioritySelect=document.createElement('select');
   prioritySelect.style.cssText='width:100%;padding:10px;font:inherit';
   for(const option of [['low','Low'],['normal','Normal'],['high','High'],['urgent','Urgent']]){
    const item=document.createElement('option');item.value=option[0];item.textContent=option[1];item.selected=ticket.priority===option[0];prioritySelect.append(item);
   }
   priorityLabel.append(prioritySelect);card.append(priorityLabel);
   const replyLabel=makeTicketElement('label','Reply to customer');
   const reply=document.createElement('textarea');reply.rows=4;reply.maxLength=4000;reply.style.cssText='box-sizing:border-box;width:100%;padding:10px;font:inherit';
   reply.value=ticket.admin_reply||'';reply.placeholder='Write a clear reply. Do not promise a refund until the verified payment/top-up status supports it.';
   replyLabel.append(reply);card.append(replyLabel);
   const save=document.createElement('button');save.type='button';save.textContent='Save reply and ticket updates';
   save.addEventListener('click',async()=>{
    if(!key.value){result.textContent='Enter the admin API key first.';return;}
    if(!confirm('Save the reply and status/priority for ticket #'+ticket.id+'?'))return;
    save.disabled=true;result.textContent='Saving ticket #'+ticket.id+'…';
    try{
     const updated=await adminRequest('/api/admin/support/tickets/'+encodeURIComponent(ticket.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:statusSelect.value,priority:prioritySelect.value,adminReply:reply.value})});
     result.textContent=JSON.stringify({saved:true,ticket:updated.ticket},null,2);
     await refreshSupportTickets();
    }catch(error){result.textContent='Could not save ticket: '+error.message;}
    finally{save.disabled=false;}
   });
   card.append(save);
   supportTickets.append(card);
  }
  result.textContent='Loaded '+tickets.length+' support ticket(s).';
 }catch(error){
  supportTickets.replaceChildren(makeTicketElement('p','Could not load support tickets.'));
  result.textContent='Could not load support tickets: '+error.message;
 }finally{key.value='';loadSupportTickets.disabled=false;}
}
loadSupportTickets.addEventListener('click',refreshSupportTickets);

form.addEventListener('submit',async event=>{
 event.preventDefault();
 result.textContent='Checking DT One pre-production…';
 try{
  const response=await fetch('/api/admin/dtone/products/7194',{headers:{'x-admin-api-key':key.value},cache:'no-store'});
  const data=await response.json();
  result.textContent=JSON.stringify(data,null,2);
 }catch(_){
  result.textContent='Could not contact the backend. Please try again later.';
 }
 key.value='';
});
loadPricing.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 result.textContent='Loading selected country pricing settings…';
 try{
  const data=await adminRequest('/api/admin/pricing');
  const selectedCountry=pricingCountry.value;
  const saved=(data.pricing||[]).find(item=>item.country===selectedCountry);
  if(!saved)throw new Error('No pricing settings found for '+selectedCountry+'. Run the latest backend migration first.');
  loadedCountryPricing=saved;
  feeEur.value=(Number(saved.fee_eur_cents)/100).toFixed(2);
  afnRate.value=Number(saved.afn_per_eur);
  bonusPercent.value=Number(saved.bonus_percent);
  stripeFeePercent.value=Number(saved.stripe_fee_percent);
  stripeFixedFee.value=(Number(saved.stripe_fixed_fee_cents)/100).toFixed(2);
  pricingActive.checked=saved.active===true;
  result.textContent=JSON.stringify({loaded:true,country:saved.country,localCurrency:countryCurrencies[saved.country],appFeeEur:Number(saved.fee_eur_cents)/100,localCurrencyPerEur:Number(saved.afn_per_eur),legacyBonusPercent:Number(saved.bonus_percent),active:saved.active,stripeFeePercent:saved.stripe_fee_percent,stripeFixedFeeCents:saved.stripe_fixed_fee_cents},null,2);
 }catch(error){result.textContent='Could not load pricing: '+error.message;}
});
savePricing.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 if(!loadedCountryPricing||loadedCountryPricing.country!==pricingCountry.value){result.textContent='First load the selected country settings and review them.';return;}
 const fee=Number(feeEur.value),rate=Number(afnRate.value),bonus=Number(bonusPercent.value),stripeRate=Number(stripeFeePercent.value),stripeFixed=Number(stripeFixedFee.value);
 if(!Number.isFinite(fee)||fee<0||fee>1000||!Number.isFinite(rate)||rate<=0||!Number.isFinite(bonus)||bonus<0||bonus>100||!Number.isFinite(stripeRate)||stripeRate<0||stripeRate>=100||!Number.isFinite(stripeFixed)||stripeFixed<0||stripeFixed>100){result.textContent='Check app fee, exchange rate, legacy bonus, and Stripe fee values.';return;}
 const selectedCountry=pricingCountry.value;
 if(!confirm('Save '+selectedCountry+' pricing settings? App fee: €'+fee.toFixed(2)+', '+countryCurrencies[selectedCountry]+'/EUR: '+rate+', estimated Stripe fee: '+stripeRate+'% + €'+stripeFixed.toFixed(2)+'. General bonus remains disabled. This will not activate any product.'))return;
 result.textContent='Saving selected country pricing settings…';
 try{
  const data=await adminRequest('/api/admin/pricing/'+selectedCountry,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({feeEurCents:Math.round(fee*100),afnPerEur:rate,bonusPercent:0,stripeFeePercent:stripeRate,stripeFixedFeeCents:Math.round(stripeFixed*100),active:pricingActive.checked})});
  loadedCountryPricing=data.pricing;
  result.textContent=JSON.stringify({saved:true,pricing:data.pricing,note:data.note},null,2);
 }catch(error){result.textContent='Could not save pricing: '+error.message;}
 finally{key.value='';}
});
checkDatabase.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 result.textContent='Reading saved product and pricing settings…';
 try{const data=await adminRequest('/api/admin/catalog/7194/pricing');result.textContent=JSON.stringify(data,null,2);}
 catch(error){result.textContent='Could not verify database pricing: '+error.message;}
 finally{key.value='';}
});
discover.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 result.textContent='Searching DT One pre-production catalog…';
 try{
  const response=await fetch('/api/admin/dtone/products?country_iso_code=AFG&operator=ATOMA&amount=115',{headers:{'x-admin-api-key':key.value},cache:'no-store'});
  const data=await response.json();
  result.textContent=JSON.stringify(data,null,2);
 }catch(_){result.textContent='Could not contact the backend. Please try again later.';}
 key.value='';
});
runSandbox.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 if(!confirmSandbox.checked){result.textContent='Tick the sandbox confirmation box first.';return;}
 if(!confirm('Submit one transaction to DT One PRE-PRODUCTION? No Stripe payment is created.'))return;
 result.textContent='Submitting one sandbox transaction. Do not press again while waiting…';
 runSandbox.disabled=true;
 try{
  const data=await adminRequest('/api/admin/dtone/sandbox-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmSandbox:true,scenario:scenario.value})});
  if(data.orderId)orderId.value=data.orderId;
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){result.textContent='Sandbox test did not confirm success. Details: '+error.message;}
 finally{key.value='';runSandbox.disabled=false;confirmSandbox.checked=false;}
});
loadReviewQueue.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 result.textContent='Loading orders that need review…';
 try{
  const data=await adminRequest('/api/admin/orders/review');
  result.textContent=JSON.stringify({
   count:data.count,
   thresholds:data.thresholds,
   automaticRetry:data.automaticRetry,
   orders:(data.orders||[]).map(order=>({
    order_id:order.order_id,
    operator:order.operator,
    amount:order.amount,
    currency:order.currency,
    status:order.status,
    dtone_transaction_id:order.dtone_transaction_id,
    dtone_status:order.dtone_status,
    review_reason:order.review_reason,
    updated_at:order.updated_at
   })),
   note:data.note
  },null,2);
 }catch(error){result.textContent='Could not load review queue: '+error.message;}
 finally{key.value='';}
});
runStripeDtoneSandbox.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 if(!confirmStripeDtoneSandbox.checked){result.textContent='Tick the Stripe TEST + DT One PRE-PRODUCTION confirmation first.';return;}
 if(!confirm('Create a Stripe TEST checkout? If you complete it with a test card, one DT One PRE-PRODUCTION sandbox transaction will be submitted. No real card charge or catalog activation occurs.'))return;
 result.textContent='Creating one sandbox checkout…';
 runStripeDtoneSandbox.disabled=true;
 try{
  const data=await adminRequest('/api/admin/stripe-dtone/sandbox-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmSandbox:true})});
  result.textContent=JSON.stringify(data,null,2);
  if(data.checkoutUrl){
   const open=confirm('Test checkout created for '+data.amountFormatted+'. Open Stripe checkout now?');
   if(open)window.location.href=data.checkoutUrl;
  }
 }catch(error){result.textContent='Could not create sandbox checkout: '+error.message;}
 finally{key.value='';runStripeDtoneSandbox.disabled=false;confirmStripeDtoneSandbox.checked=false;}
});
checkStripePaymentStatus.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const id=orderId.value.trim();
 if(!id){result.textContent='Enter the existing order ID first.';return;}
 if(!/^[0-9a-f-]{36}$/i.test(id)){result.textContent='Enter a valid order UUID.';return;}
 result.textContent='Checking Stripe payment status (read-only)…';
 checkStripePaymentStatus.disabled=true;
 try{
  const sessionId=stripeSessionId.value.trim();
  const sessionQuery=sessionId?'?session_id='+encodeURIComponent(sessionId):'';
  const data=await adminRequest('/api/admin/orders/'+encodeURIComponent(id)+'/payment-status'+sessionQuery);
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){result.textContent='Could not verify Stripe payment status: '+error.message;}
 finally{key.value='';checkStripePaymentStatus.disabled=false;}
});
checkSandboxStatus.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 if(!orderId.value.trim()){result.textContent='Enter the sandbox order ID first.';return;}
 result.textContent='Loading saved sandbox order status…';
 try{const data=await adminRequest('/api/admin/dtone/sandbox-test/'+encodeURIComponent(orderId.value.trim()));result.textContent=JSON.stringify(data,null,2);}
 catch(error){result.textContent='Could not verify saved status: '+error.message;}
 finally{key.value='';}
});
checkLiveDtOneStatus.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const externalId=orderId.value.trim();
 if(!externalId){result.textContent='Enter the existing order ID first.';return;}
 result.textContent='Querying DT One directly (read-only)…';
 checkLiveDtOneStatus.disabled=true;
 try{
  const data=await adminRequest('/api/admin/dtone/transaction-status?external_id='+encodeURIComponent(externalId));
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){result.textContent='Could not query DT One live status: '+error.message;}
 finally{key.value='';checkLiveDtOneStatus.disabled=false;}
});
</script>
</body>
</html>`);
});

// Read-only DT One product verification. This never enables a catalog entry
// and never creates a transaction. Keep the endpoint admin-authenticated.
app.get('/api/admin/dtone/products/:productId', requireAdmin, async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'A valid product ID is required.' });
  }

  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    return res.status(503).json({ error: 'DT One credentials are not configured.' });
  }

  try {
    const response = await fetch(
      `${DTONE_API_BASE_URL}/v1/products/${productId}`,
      {
        method: 'GET',
        headers: {
          Authorization: getDtOneAuthHeader(),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    const responseText = await response.text();
    let data = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      console.warn('DT One product verification returned HTTP', response.status);
      return res.status(response.status === 404 ? 404 : 502).json({
        verified: false,
        productId,
        providerStatus: response.status,
        error: response.status === 404
          ? 'Product ID was not found in the configured DT One environment.'
          : 'DT One could not verify this product. Check the provider response in DT One support or dashboard.',
      });
    }

    return res.json({
      verified: true,
      environment: /preprod/i.test(DTONE_API_BASE_URL) ? 'pre-production' : 'configured',
      product: data,
      catalogActivation: 'unchanged',
      transactionCreated: false,
    });
  } catch (error) {
    console.error('DT One product verification failed:', error.message);
    return res.status(502).json({
      verified: false,
      productId,
      error: 'Could not reach DT One to verify this product.',
    });
  }
});


// Read-only product discovery in the configured DT One environment.
// Used to find the correct pre-production product ID; never creates transactions.
app.get('/api/admin/dtone/products', requireAdmin, async (req, res) => {
  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    return res.status(503).json({ error: 'DT One credentials are not configured.' });
  }

  const countryIsoCode = String(req.query.country_iso_code || 'AFG').toUpperCase();
  const operatorQuery = String(req.query.operator || '').trim().toUpperCase();
  const amountQuery = Number(req.query.amount || 115);
  if (!/^[A-Z]{3}$/.test(countryIsoCode)) {
    return res.status(400).json({ error: 'country_iso_code must be a three-letter ISO code.' });
  }
  if (!Number.isFinite(amountQuery) || amountQuery <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }

  try {
    const matchesById = new Map();
    let providerPagesChecked = 0;
    let totalSeen = 0;

    // Check a bounded number of pages to avoid unbounded provider requests.
    for (let page = 1; page <= 5; page += 1) {
      const url = new URL(`${DTONE_API_BASE_URL}/v1/products`);
      url.searchParams.set('country_iso_code', countryIsoCode);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: getDtOneAuthHeader(),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(20000),
      });

      const responseText = await response.text();
      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch (_) {
        data = null;
      }

      if (!response.ok) {
        const providerBody = String(responseText || '').slice(0, 1000);
        console.warn('DT One product discovery failed', JSON.stringify({
          status: response.status,
          page,
          baseUrl: DTONE_API_BASE_URL,
          responseBody: providerBody,
        }));
        return res.status(502).json({
          verified: false,
          providerStatus: response.status,
          configuredBaseUrl: DTONE_API_BASE_URL,
          providerMessage: providerBody || null,
          pagesChecked: providerPagesChecked,
          error: 'DT One product discovery failed. Check providerMessage and the configured API environment.',
        });
      }

      const products = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      providerPagesChecked += 1;
      totalSeen += products.length;

      for (const product of products) {
        const operatorName = String(product?.operator?.name || '').toUpperCase();
        const countryCode = String(product?.operator?.country?.iso_code || '').toUpperCase();
        const name = String(product?.name || '');
        const benefitAmounts = Array.isArray(product?.benefits)
          ? product.benefits.map((benefit) => Number(benefit?.amount?.total_excluding_tax ?? benefit?.amount?.base))
          : [];
        const productAmounts = [
          product?.destination?.amount,
          product?.amount?.base,
          typeof product?.amount === 'number' ? product.amount : NaN,
        ].map(Number);
        const mentionsAmount = benefitAmounts.includes(amountQuery)
          || productAmounts.includes(amountQuery)
          || new RegExp(`\\b${amountQuery}\\s*AFN\\b|\\bAFN\\s*${amountQuery}\\b`, 'i').test(name);
        const isRequestedOperator = !operatorQuery || operatorName.includes(operatorQuery);
        const isLikelyRelevant = operatorQuery
          ? isRequestedOperator
          : (operatorName.includes('ATOMA') || mentionsAmount);
        if (countryCode === countryIsoCode && isLikelyRelevant) {
          const id = product?.id;
          if (id !== undefined && id !== null) matchesById.set(String(id), product);
        }
      }

      if (products.length < 100) break;
    }

    const products = [...matchesById.values()];
    return res.json({
      verified: true,
      environment: /preprod/i.test(DTONE_API_BASE_URL) ? 'pre-production' : 'configured',
      countryIsoCode,
      requestedOperator: operatorQuery || null,
      requestedAmount: amountQuery,
      providerPagesChecked,
      providerProductsSeen: totalSeen,
      resultCount: products.length,
      products,
      catalogActivation: 'unchanged',
      transactionCreated: false,
      note: 'Read-only search across up to five pages. Results are candidates; confirm operator, denomination, and pre-production availability before mapping.',
    });
  } catch (error) {
    console.error('DT One product discovery failed:', error.message);
    return res.status(502).json({
      verified: false,
      error: 'Could not reach DT One product discovery endpoint.',
    });
  }
});

// Read-only verification of a catalog product and its country pricing settings.
// Does not change product activation, prices, orders, or payments.
app.get('/api/admin/catalog/:productId/pricing', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'A valid product ID is required.' });
  }
  try {
    const productResult = await pool.query(
      `SELECT product_id, country, operator, amount, currency,
              price_eur_cents, wholesale_price_eur_cents, bonus_amount, active
       FROM product_catalog
       WHERE product_id = $1
       LIMIT 1`,
      [productId]
    );
    if (productResult.rowCount !== 1) {
      return res.status(404).json({ error: 'Product was not found in product_catalog.', productId });
    }
    const product = productResult.rows[0];
    const pricingResult = await pool.query(
      `SELECT country, fee_eur_cents, bonus_percent, stripe_fee_percent,
              stripe_fixed_fee_cents, active
       FROM pricing_settings
       WHERE country = $1
       LIMIT 1`,
      [product.country]
    );
    const pricing = pricingResult.rows[0] || null;
    let customerPricePreview = null;
    if (product.wholesale_price_eur_cents != null && pricing !== null) {
      try {
        const preview = calculateFinalPrice(
          {
            wholesalePriceCents: Number(product.wholesale_price_eur_cents),
          },
          {
            feeCents: Number(pricing.fee_eur_cents),
            bonusPercent: Number(pricing.bonus_percent),
            stripeFeePercent: Number(pricing.stripe_fee_percent),
            stripeFixedFeeCents: Number(pricing.stripe_fixed_fee_cents),
          }
        );
        customerPricePreview = {
          currency: 'EUR',
          estimatedCustomerPriceEur: Number((preview.finalPriceCents / 100).toFixed(2)),
          estimatedCustomerPriceCents: preview.finalPriceCents,
          wholesaleCostEur: Number((preview.basePriceCents / 100).toFixed(2)),
          appFeeEur: Number((preview.feeCents / 100).toFixed(2)),
          estimatedStripeFeeEur: Number((preview.estimatedStripeFeeCents / 100).toFixed(2)),
          note: 'Preview only. Actual Stripe fees may differ; this does not enable the product or perform a payment.',
        };
      } catch (previewError) {
        customerPricePreview = { error: 'Could not calculate customer price preview from the saved settings.' };
      }
    }
    return res.json({
      readOnly: true,
      customerPricePreview,
      paymentCurrency: 'EUR',
      product: {
        ...product,
        retailPriceEur: Number(product.price_eur_cents) / 100,
        wholesalePriceEur: product.wholesale_price_eur_cents == null
          ? null : Number(product.wholesale_price_eur_cents) / 100,
        active: product.active === true
      },
      pricing: pricing ? {
        ...pricing,
        appFeeEur: Number(pricing.fee_eur_cents) / 100,
        stripeFeeNote: 'Stripe fee is an estimate; actual fees depend on the Stripe account, card and payment method.'
      } : null,
      checks: {
        wholesalePriceConfigured: product.wholesale_price_eur_cents != null,
        pricingSettingsConfigured: pricing !== null,
        productEnabled: product.active === true,
        safeForRealCheckout: product.wholesale_price_eur_cents != null && pricing !== null && pricing.active === true && product.active === true
      },
      note: 'Read-only verification only. No product, order, payment, or setting was changed.'
    });
  } catch (error) {
    console.error('Admin catalog pricing verification failed:', error.message);
    return res.status(500).json({ error: 'Could not verify catalog pricing.' });
  }
});

// Admin pricing overview.
// Prices and fees are returned in EUR cents.
app.get('/api/admin/pricing', requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is not configured.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         country,
         fee_eur_cents,
         afn_per_eur,
         bonus_percent,
         stripe_fee_percent,
         stripe_fixed_fee_cents,
         active
       FROM pricing_settings
       ORDER BY country`
    );

    return res.json({
      paymentCurrency: 'EUR',
      pricing: result.rows,
      stripeFeeNote: 'Stripe fee is an estimate; actual fees vary by card and payment method.',
    });
  } catch (error) {
    console.error(
      'Admin pricing query failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Could not load pricing settings.',
    });
  }
});

// Update country pricing controls from a trusted admin client.
// Prices are stored in integer EUR cents; bonus is informational
// until country/operator bonus fulfillment rules are verified.
app.put('/api/admin/pricing/:country', requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is not configured.',
    });
  }

  const country = normalizeCountry(req.params.country);

  if (!isValidCountry(country)) {
    return res.status(400).json({
      error: 'Unsupported country.',
    });
  }

  const body = req.body || {};
  const feeCents = Number(body.feeEurCents);
  const afnPerEur = Number(body.afnPerEur);
  const bonusPercent = Number(body.bonusPercent);
  const stripeFeePercent = Number(body.stripeFeePercent);
  const stripeFixedFeeCents = Number(body.stripeFixedFeeCents);

  if (
    !Number.isSafeInteger(feeCents) ||
    feeCents < 0 ||
    feeCents > 100000
  ) {
    return res.status(400).json({
      error: 'feeEurCents must be an integer from 0 to 100000.',
    });
  }

  if (!Number.isFinite(afnPerEur) || afnPerEur <= 0 || afnPerEur > 1000000) {
    return res.status(400).json({ error: 'afnPerEur must be a positive number no greater than 1000000.' });
  }

  if (
    !Number.isFinite(bonusPercent) ||
    bonusPercent < 0 ||
    bonusPercent > 100
  ) {
    return res.status(400).json({
      error: 'bonusPercent must be between 0 and 100.',
    });
  }

  if (!Number.isFinite(stripeFeePercent) || stripeFeePercent < 0 || stripeFeePercent >= 100) {
    return res.status(400).json({ error: 'stripeFeePercent must be from 0 up to (but not including) 100.' });
  }
  if (!Number.isSafeInteger(stripeFixedFeeCents) || stripeFixedFeeCents < 0 || stripeFixedFeeCents > 10000) {
    return res.status(400).json({ error: 'stripeFixedFeeCents must be an integer from 0 to 10000.' });
  }

  if (typeof body.active !== 'boolean') {
    return res.status(400).json({
      error: 'active must be true or false.',
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO pricing_settings (
         country, fee_eur_cents, afn_per_eur, bonus_percent,
         stripe_fee_percent, stripe_fixed_fee_cents, active, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (country)
       DO UPDATE SET
         fee_eur_cents = EXCLUDED.fee_eur_cents,
         afn_per_eur = EXCLUDED.afn_per_eur,
         bonus_percent = EXCLUDED.bonus_percent,
         stripe_fee_percent = EXCLUDED.stripe_fee_percent,
         stripe_fixed_fee_cents = EXCLUDED.stripe_fixed_fee_cents,
         active = EXCLUDED.active,
         updated_at = NOW()
       RETURNING country, fee_eur_cents, afn_per_eur, bonus_percent,
                 stripe_fee_percent, stripe_fixed_fee_cents, active, updated_at`,
      [country, feeCents, afnPerEur, bonusPercent, stripeFeePercent, stripeFixedFeeCents, body.active]
    );

    return res.json({
      paymentCurrency: 'EUR',
      pricing: result.rows[0],
      note: 'Bonus percentage is saved as a setting; bonus delivery is not enabled by this endpoint.',
    });
  } catch (error) {
    console.error(
      'Admin pricing update failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Could not update pricing settings.',
    });
  }
});

// List orders requiring operator review, including stale in-flight
// states after a server restart. This is read-only: it never retries DT One.
// Read-only Stripe reconciliation for a single order. Does not create payments,
// retry a top-up, or issue a refund.
app.get('/api/admin/orders/:orderId/payment-status', requireAdmin, async (req, res) => {
  if (!pool || !stripe) {
    return res.status(503).json({ error: 'Payment service is not configured.' });
  }

  const orderId = String(req.params.orderId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }

  try {
    const result = await pool.query(
      `SELECT order_id, status, charge_cents, currency,
              stripe_session_id, stripe_payment_intent_id, created_at
       FROM orders
       WHERE order_id = $1
       LIMIT 1`,
      [orderId]
    );

    if (result.rowCount !== 1) {
      // An admin may provide a known Checkout Session ID from Stripe's event
      // dashboard. Retrieve that exact object first, but accept it only when
      // Stripe's own order reference exactly matches the requested order ID.
      const suppliedSessionId = String(req.query.session_id || '').trim();
      if (suppliedSessionId) {
        if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(suppliedSessionId)) {
          return res.status(400).json({
            error: 'Invalid Stripe Checkout Session ID.',
            lookup: 'read_only',
            orderId,
          });
        }
        const exactSession = await stripe.checkout.sessions.retrieve(
          suppliedSessionId,
          { expand: ['payment_intent'] }
        );
        const sessionOrderId = exactSession.metadata?.orderId || exactSession.client_reference_id;
        if (sessionOrderId !== orderId ||
            (exactSession.client_reference_id && exactSession.client_reference_id !== orderId) ||
            (exactSession.metadata?.orderId && exactSession.metadata.orderId !== orderId)) {
          return res.status(409).json({
            error: 'Stripe Checkout Session does not exactly match the requested order ID.',
            lookup: 'read_only',
            orderId,
            stripeSessionId: exactSession.id,
            stripeSessionLivemode: exactSession.livemode,
            stripeSessionCurrency: exactSession.currency || null,
            stripeSessionAmountTotal: exactSession.amount_total ?? null,
            stripeSessionStatus: exactSession.status || null,
            stripePaymentStatus: exactSession.payment_status || null,
            // Read-only diagnostics so the admin can compare the retrieved
            // Stripe object with the exact event JSON without exposing secrets.
            retrievedClientReferenceId: exactSession.client_reference_id || null,
            retrievedMetadataOrderId: exactSession.metadata?.orderId || null,
            clientReferenceMatches: exactSession.client_reference_id === orderId,
            metadataOrderIdMatches: exactSession.metadata?.orderId === orderId,
            note: 'No order was created and no payment, refund, or DT One action was performed.',
          });
        }
        const exactIntent = exactSession.payment_intent && typeof exactSession.payment_intent === 'object'
          ? exactSession.payment_intent
          : typeof exactSession.payment_intent === 'string'
            ? await stripe.paymentIntents.retrieve(exactSession.payment_intent)
            : null;
        return res.status(200).json({
          lookup: 'read_only',
          orderId,
          localOrderFound: false,
          stripeSessionFound: true,
          stripeSessionId: exactSession.id,
          stripeSessionStatus: exactSession.status,
          stripePaymentStatus: exactSession.payment_status,
          stripePaymentIntentId: exactIntent?.id || null,
          stripePaymentIntentStatus: exactIntent?.status || null,
          amountTotal: exactSession.amount_total,
          amountReceived: exactIntent?.amount_received ?? null,
          stripeCurrency: exactSession.currency || exactIntent?.currency || null,
          livemode: exactSession.livemode,
          clientReferenceMatches: exactSession.client_reference_id === orderId,
          metadataOrderIdMatches: exactSession.metadata?.orderId === orderId,
          associationVerified: true,
          nextStep: 'Verified exact Checkout Session only; no order was created and no top-up or refund was triggered.',
        });
      }

      // The Checkout Session can contain the exact order reference even when
      // the PaymentIntent does not. Search recent sessions and require an exact
      // client_reference_id or metadata.orderId match; never match by amount.
      let matchedSession = null;
      let matchedIntent = null;
      let sessionPagesScanned = 0;
      let sessionSearchHasMore = false;
      let startingAfter;
      for (let page = 0; page < 5; page += 1) {
        const params = {
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        };
        const sessions = await stripe.checkout.sessions.list(params);
        sessionPagesScanned += 1;
        sessionSearchHasMore = sessions.has_more;
        const candidate = sessions.data.find((item) =>
          item.client_reference_id === orderId ||
          item.metadata?.orderId === orderId
        );
        if (candidate) {
          const sessionOrderId = candidate.metadata?.orderId || candidate.client_reference_id;
          if (sessionOrderId === orderId) {
            matchedSession = await stripe.checkout.sessions.retrieve(
              candidate.id,
              { expand: ['payment_intent'] }
            );
            if (matchedSession.payment_intent && typeof matchedSession.payment_intent === 'object') {
              matchedIntent = matchedSession.payment_intent;
            } else if (typeof matchedSession.payment_intent === 'string') {
              matchedIntent = await stripe.paymentIntents.retrieve(matchedSession.payment_intent);
            }
          }
          break;
        }
        if (!sessions.has_more || sessions.data.length === 0) break;
        startingAfter = sessions.data[sessions.data.length - 1].id;
      }

      if (matchedSession) {
        const intentOrderId = matchedIntent?.metadata?.orderId || null;
        const associationVerified =
          (matchedSession.client_reference_id === orderId ||
            matchedSession.metadata?.orderId === orderId) &&
          (!intentOrderId || intentOrderId === orderId);
        return res.status(200).json({
          lookup: 'read_only',
          orderId,
          localOrderFound: false,
          localOrderStatus: null,
          stripeSessionFound: true,
          stripeSessionId: matchedSession.id,
          stripeSessionStatus: matchedSession.status,
          stripePaymentStatus: matchedSession.payment_status,
          stripePaymentIntentId: matchedIntent?.id || null,
          stripePaymentIntentStatus: matchedIntent?.status || null,
          amountTotal: matchedSession.amount_total,
          amountReceived: matchedIntent?.amount_received ?? null,
          stripeCurrency: matchedSession.currency || matchedIntent?.currency || null,
          livemode: matchedSession.livemode,
          clientReferenceMatches: matchedSession.client_reference_id === orderId,
          metadataOrderIdMatches: matchedSession.metadata?.orderId === orderId,
          associationVerified,
          sessionPagesScanned,
          sessionSearchHasMore,
          nextStep: 'Review the verified Checkout Session and restore/reconcile the missing local order through an audited admin process. This lookup did not create an order, top-up, or refund.',
        });
      }

      // Fallback to exact PaymentIntent metadata when no Checkout Session
      // reference is found. Never associate by amount, currency, or timestamp.
      if (typeof stripe.paymentIntents.search === 'function') {
        const found = await stripe.paymentIntents.search({
          query: `metadata['orderId']:'${orderId}'`,
          limit: 10,
        });
        const matches = found.data.filter((candidate) =>
          candidate.metadata?.orderId === orderId
        );

        if (matches.length > 0) {
          return res.status(200).json({
            lookup: 'read_only',
            orderId,
            localOrderFound: false,
            localOrderStatus: null,
            stripePaymentIntentFound: true,
            stripePaymentIntents: matches.map((intent) => ({
              id: intent.id,
              status: intent.status,
              amount: intent.amount,
              amountReceived: intent.amount_received,
              currency: intent.currency,
              livemode: intent.livemode,
              created: intent.created,
              metadataOrderIdMatches: intent.metadata?.orderId === orderId,
            })),
            paymentIntentSearchCount: found.data.length,
            associationVerified: matches.every((intent) =>
              intent.metadata?.orderId === orderId
            ),
            nextStep: 'Review the exact Stripe payment and restore/reconcile the missing local order through an audited admin process. No order was created and no top-up or refund was triggered.',
          });
        }
      }

      return res.status(404).json({
        error: 'Local order not found and no exact Stripe PaymentIntent metadata match was found.',
        lookup: 'read_only',
        orderId,
        localOrderFound: false,
        stripeMetadataSearchAttempted: typeof stripe.paymentIntents.search === 'function',
        note: 'A Stripe search can be eventually consistent. Verify in Stripe Dashboard before concluding that no payment exists.',
      });
    }

    const order = result.rows[0];
    let session = null;
    let paymentIntent = null;
    const stripeLookupDiagnostics = {
      mode: STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' :
        STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'unknown',
      sessionPagesScanned: 0,
      sessionsScanned: 0,
      sessionSearchHasMore: false,
      paymentIntentSearchCount: 0,
      orderCreatedAt: order.created_at,
    };

    if (order.stripe_session_id) {
      session = await stripe.checkout.sessions.retrieve(
        order.stripe_session_id,
        { expand: ['payment_intent'] }
      );
      if (session.payment_intent && typeof session.payment_intent === 'object') {
        paymentIntent = session.payment_intent;
      }
    }

    if (!paymentIntent && order.stripe_payment_intent_id) {
      paymentIntent = await stripe.paymentIntents.retrieve(
        order.stripe_payment_intent_id
      );
    }

    // Recovery lookup for legacy orders whose Stripe IDs were not saved locally.
    // Search only sessions created around/after this order, and accept a match
    // only when Stripe's client_reference_id or metadata.orderId equals orderId.
    if (!session) {
      const orderCreatedSeconds = Math.max(
        0,
        Math.floor(new Date(order.created_at).getTime() / 1000) - 300
      );
      let startingAfter;
      for (let page = 0; page < 5; page += 1) {
        const params = {
          limit: 100,
          created: { gte: orderCreatedSeconds },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        };
        const sessions = await stripe.checkout.sessions.list(params);
        stripeLookupDiagnostics.sessionPagesScanned += 1;
        stripeLookupDiagnostics.sessionsScanned += sessions.data.length;
        stripeLookupDiagnostics.sessionSearchHasMore = sessions.has_more;
        const match = sessions.data.find((candidate) =>
          candidate.client_reference_id === orderId ||
          candidate.metadata?.orderId === orderId
        );
        if (match) {
          session = await stripe.checkout.sessions.retrieve(
            match.id,
            { expand: ['payment_intent'] }
          );
          if (session.payment_intent && typeof session.payment_intent === 'object') {
            paymentIntent = session.payment_intent;
          }
          break;
        }
        if (!sessions.has_more || sessions.data.length === 0) break;
        startingAfter = sessions.data[sessions.data.length - 1].id;
      }
    }

    // Last read-only fallback: exact metadata match on PaymentIntent.
    // Never associate a payment solely by amount, currency, or timestamp.
    if (!paymentIntent && typeof stripe.paymentIntents.search === 'function') {
      const found = await stripe.paymentIntents.search({
        query: `metadata['orderId']:'${orderId}'`,
        limit: 10,
      });
      stripeLookupDiagnostics.paymentIntentSearchCount = found.data.length;
      const match = found.data.find((candidate) =>
        candidate.metadata?.orderId === orderId
      );
      if (match) paymentIntent = match;
    }

    const sessionOrderId = session?.metadata?.orderId || session?.client_reference_id || null;
    const intentOrderId = paymentIntent?.metadata?.orderId || null;
    const associationVerified =
      Boolean(session || paymentIntent) &&
      (!session || sessionOrderId === orderId) &&
      (!paymentIntent || !intentOrderId || intentOrderId === orderId);

    return res.status(200).json({
      lookup: 'read_only',
      orderId,
      localOrderStatus: order.status,
      // The order's currency is the recipient top-up currency (e.g. AFN),
      // while charge_cents is the EUR amount charged by Stripe.
      chargeCents: Number(order.charge_cents),
      paymentCurrency: 'EUR',
      topupCurrency: order.currency,
      currency: order.currency,
      stripeSessionFound: Boolean(session),
      stripeSessionId: session?.id || order.stripe_session_id || null,
      stripeSessionStatus: session?.status || null,
      stripePaymentStatus: session?.payment_status || null,
      stripePaymentIntentId: paymentIntent?.id || order.stripe_payment_intent_id || null,
      stripePaymentIntentStatus: paymentIntent?.status || null,
      amountTotal: session?.amount_total ?? null,
      amountReceived: paymentIntent?.amount_received ?? null,
      stripeCurrency: session?.currency || paymentIntent?.currency || null,
      livemode: session?.livemode ?? paymentIntent?.livemode ?? null,
      associationVerified,
      stripeLookupDiagnostics,
      note: 'Read-only reconciliation only. No payment, top-up, or refund was created.',
    });
  } catch (error) {
    console.error('Admin Stripe payment-status lookup failed:', error.message);
    return res.status(502).json({
      error: 'Could not verify Stripe payment status. Reconcile the order in Stripe Dashboard.',
    });
  }
});

app.get('/api/admin/orders/review', requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is not configured.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         order_id,
         country,
         operator,
         phone,
         amount,
         currency,
         charge_cents,
         status,
         stripe_payment_intent_id,
         dtone_transaction_id,
         dtone_status,
         dtone_error,
         created_at,
         updated_at,
         CASE
           WHEN status = 'topup_review'
             THEN 'manual_review_required'
           WHEN status = 'processing_topup'
             THEN 'stale_processing_topup'
           WHEN status = 'topup_submitted'
             THEN 'stale_provider_status'
           ELSE 'review_required'
         END AS review_reason
       FROM orders
       WHERE status = 'topup_review'
          OR (
            status = 'processing_topup'
            AND updated_at < NOW() - INTERVAL '5 minutes'
          )
          OR (
            status = 'topup_submitted'
            AND updated_at < NOW() - INTERVAL '15 minutes'
          )
       ORDER BY updated_at ASC
       LIMIT 100`
    );

    return res.json({
      count: result.rowCount,
      orders: result.rows,
      thresholds: {
        processingTopupMinutes: 5,
        topupSubmittedMinutes: 15,
      },
      automaticRetry: false,
      note: 'Stale orders are surfaced for authenticated admin review only. Check the provider transaction/status before any manual action; do not blindly resubmit.',
    });
  } catch (error) {
    console.error(
      'Admin review queue failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Could not load review queue.',
    });
  }
});

// Full Stripe refund, initiated only by an authenticated admin.
// Idempotency is enforced both by the refunds table's UNIQUE(order_id)
// constraint and Stripe's idempotency key. This endpoint deliberately
// does not refund orders that are already completed by DT One.
app.post('/api/admin/orders/:orderId/refund', requireAdmin, async (req, res) => {
  if (!pool || !stripe) {
    return res.status(503).json({ error: 'Payment service is not configured.' });
  }

  const orderId = String(req.params.orderId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }

  const reason = String(req.body?.reason || 'Top-up failed; admin reviewed')
    .trim()
    .slice(0, 500);
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    // Keep the order lock until Stripe has returned and both database
    // records have been updated. A DT One callback cannot change the order
    // to completed between our eligibility check and refund finalization.
    await client.query('BEGIN');
    transactionOpen = true;

    const orderResult = await client.query(
      `SELECT order_id, status, charge_cents, stripe_payment_intent_id, dtone_status
       FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];
    if (order.status === 'completed' || order.status === 'refunded') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({
        error: 'Order is already completed or refunded; no refund was started.',
      });
    }

    if (order.status !== 'topup_review' ||
        !['failed', 'rejected', 'cancelled', 'canceled', 'declined'].includes(String(order.dtone_status || '').trim().toLowerCase())) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({
        error: 'Refund requires a final DT One failure status. Unknown or pending outcomes must be reconciled first.',
      });
    }

    if (!order.stripe_payment_intent_id) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'The order has no verified Stripe PaymentIntent.' });
    }

    // Verify the actual Stripe PaymentIntent before creating any refund record
    // or sending a refund request. The order's charge_cents is EUR, while
    // order.currency is the destination top-up currency (e.g. AFN).
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(
        order.stripe_payment_intent_id
      );
    } catch (lookupError) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(502).json({
        error: 'Could not verify the Stripe payment. No refund was started.',
      });
    }

    const stripeIsTest = STRIPE_SECRET_KEY.startsWith('sk_test_');
    if (
      paymentIntent.id !== order.stripe_payment_intent_id ||
      paymentIntent.status !== 'succeeded' ||
      paymentIntent.currency !== 'eur' ||
      paymentIntent.amount_received !== Number(order.charge_cents) ||
      paymentIntent.livemode === stripeIsTest
    ) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({
        error: 'Stripe payment verification did not match this order. No refund was started.',
      });
    }

    const refundResult = await client.query(
      `SELECT id, stripe_refund_id, amount_cents, status
       FROM refunds WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    const existingRefund = refundResult.rows[0] || null;

    if (existingRefund?.status === 'succeeded') {
      await client.query('COMMIT');
      transactionOpen = false;
      return res.json({
        orderId, refundId: existingRefund.stripe_refund_id,
        status: 'refunded', duplicate: true,
      });
    }

    // Do not race two administrators or retry an ambiguous Stripe request.
    // A pending/failed row must be reconciled against Stripe before retrying.
    if (existingRefund) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({
        error: 'A refund record already exists. Reconcile it in Stripe Dashboard before retrying.',
        refundStatus: existingRefund.status,
        refundId: existingRefund.stripe_refund_id || null,
      });
    }

    await client.query(
      `INSERT INTO refunds (order_id, amount_cents, status, reason)
       VALUES ($1, $2, 'pending', $3)`,
      [orderId, Number(order.charge_cents), reason]
    );

    let refund;
    try {
      // Stable idempotency key plus the open row lock prevents concurrent
      // admin requests and callback status changes during this operation.
      refund = await stripe.refunds.create(
        {
          payment_intent: order.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: { orderId, adminReason: reason },
        },
        { idempotencyKey: `pgnt-refund-${orderId}` }
      );
    } catch (stripeError) {
      await client.query(
        `UPDATE refunds SET status = 'pending', reason = $1 WHERE order_id = $2`,
        [`Stripe outcome needs reconciliation: ${String(stripeError.message || 'unknown error').slice(0, 350)}`, orderId]
      );
      await client.query('COMMIT');
      transactionOpen = false;
      console.error('Stripe refund outcome requires reconciliation:', stripeError.message);
      return res.status(502).json({
        error: 'Stripe refund outcome is not confirmed. Check Stripe Dashboard before any retry.',
      });
    }

    await client.query(
      `UPDATE refunds SET stripe_refund_id = $1, amount_cents = $2,
         status = $3, reason = $4 WHERE order_id = $5`,
      [refund.id, refund.amount, refund.status, reason, orderId]
    );

    if (refund.status === 'succeeded') {
      await client.query(
        `UPDATE orders SET status = 'refunded',
           refunded_at = COALESCE(refunded_at, NOW()), updated_at = NOW()
         WHERE order_id = $1 AND status = 'topup_review'`,
        [orderId]
      );
    } else {
      await client.query(
        `UPDATE orders SET status = 'topup_review', updated_at = NOW()
         WHERE order_id = $1 AND status = 'topup_review'`,
        [orderId]
      );
    }

    await client.query('COMMIT');
    transactionOpen = false;
    return res.status(200).json({
      orderId, refundId: refund.id, status: refund.status,
      amountCents: refund.amount, currency: refund.currency,
    });
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Admin refund processing failed:', error.message);
    return res.status(500).json({ error: 'Refund processing failed; reconcile Stripe Dashboard before retrying.' });
  } finally {
    client.release();
  }
});

// Order-status lookup protected by a per-order access token.
// The token is returned only in the initial checkout response and stored
// as a SHA-256 hash. Orders without a token fail closed.
app.get('/api/orders/:orderId/status', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is not configured.',
    });
  }

  const orderId = String(
    req.params.orderId || ''
  ).trim();

  if (
    !/^[0-9a-f-]{36}$/i.test(orderId)
  ) {
    return res.status(400).json({
      error: 'Invalid order ID.',
    });
  }

  try {
    const accessToken = String(req.get('x-order-access-token') || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(accessToken)) {
      return res.status(401).json({ error: 'A valid order access token is required.' });
    }

    const result = await pool.query(
      `SELECT order_id, country, currency, charge_cents, status,
              created_at, updated_at, order_access_token_hash
       FROM orders WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );

    if (result.rowCount !== 1) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = result.rows[0];
    const suppliedTokenHash = crypto.createHash('sha256').update(accessToken, 'utf8').digest('hex');
    if (!order.order_access_token_hash ||
        !constantTimeEqual(suppliedTokenHash, order.order_access_token_hash)) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    return res.json({
      orderId: order.order_id,
      country: order.country,
      paymentCurrency: 'EUR',
      amountCents: Number(order.charge_cents),
      amountFormatted: formatEuro(Number(order.charge_cents)),
      status: order.status,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    });
  } catch (error) {
    console.error(
      'Order status lookup failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Could not retrieve order status.',
    });
  }
});

// Register the tightly restricted DT One pre-production test routes.
require('./dtone-sandbox-test')({
  app,
  pool,
  requireAdmin,
  DTONE_API_KEY,
  DTONE_API_SECRET,
  DTONE_API_BASE_URL,
  DTONE_CALLBACK_URL,
  getDtOneAuthHeader,
});

// Start the server only after configuration checks.
// Keep this block once, at the very end of server.js.
app.get('/api/referrals/validate/:code', async (req, res) => {
  return res.status(410).json({ valid: false, error: 'Ordinary-customer referral codes are retired.' });
  if (!pool) return res.status(503).json({ valid: false, error: 'Service unavailable.' });
  const code = String(req.params.code || '').trim().toUpperCase();
  try {
    const result = await pool.query('SELECT code, owner_name FROM referral_codes WHERE code=$1 AND active=TRUE LIMIT 1', [code]);
    if (!result.rowCount) return res.status(404).json({ valid: false, error: 'Referral code is not active.' });
    return res.json({ valid: true, code: result.rows[0].code, ownerName: result.rows[0].owner_name });
  } catch (error) {
    console.error('Referral validation failed:', error.message);
    return res.status(500).json({ valid: false, error: 'Could not validate referral code.' });
  }
});

// Small browser page for the owner to run the read-only product check
// without installing an API client. The admin key is entered by the owner
// in their browser and is never stored by this page.

async function startServer() {
  if (!pool) {
    console.error(
      'DATABASE_URL is missing. Server will not start.'
    );
    process.exitCode = 1;
    return;
  }

  if (!stripe) {
    console.error(
      'STRIPE_SECRET_KEY is missing. Server will not start.'
    );
    process.exitCode = 1;
    return;
  }

  try {
    await pool.query('SELECT 1');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `PGNT ASIAN TOPUP backend listening on port ${PORT}`
      );
      console.log(
        `Customer payment currency: ${PAYMENT_CURRENCY.toUpperCase()}`
      );
    });
  } catch (error) {
    console.error(
      'Server startup failed:',
      error.message
    );

    process.exitCode = 1;
  }
}

startServer();