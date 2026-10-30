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
const { executeReservedRefund } = require('./refund-flow');

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

// Persist the exact Stripe Checkout Session even if a webhook advances the
// order status before this request finishes. Never overwrite a different session.
async function persistStripeCheckoutSession(orderId, sessionId) {
  const saved = await pool.query(
    `UPDATE orders
     SET stripe_session_id = $1, updated_at = NOW()
     WHERE order_id = $2
       AND (stripe_session_id IS NULL OR stripe_session_id = $1)`,
    [sessionId, orderId]
  );

  if (saved.rowCount === 1) return;

  const current = await pool.query(
    'SELECT stripe_session_id FROM orders WHERE order_id = $1 LIMIT 1',
    [orderId]
  );
  if (current.rowCount === 1 && current.rows[0].stripe_session_id === sessionId) {
    return; // Idempotent: the exact session was already stored.
  }
  throw new Error('Could not safely associate the Stripe Checkout Session with its order.');
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
       COALESCE(local_currency_per_eur, afn_per_eur) AS local_currency_per_eur,
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

  const localCurrencyPerEur = Number(settings.local_currency_per_eur);
  if (!Number.isFinite(localCurrencyPerEur) || localCurrencyPerEur <= 0) {
    throw new Error('Invalid local-currency-per-EUR exchange rate.');
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
    localCurrencyPerEur,
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

  // Read-only quote requests may inspect inactive catalog products.
  // All checkout/order callers remain strict unless explicitly opted in.
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
// Optional operator fee overrides replace, rather than stack on, the country app fee.
async function resolveProductPricing(client, country, operator, product, pricing) {
  const name = String(operator || product?.name || '').trim();
  if (!name) return pricing;
  const result = await client.query(
    `SELECT fee_eur_cents, fee_percent, active FROM operator_pricing_settings
     WHERE country = $1 AND LOWER(operator) = LOWER($2) LIMIT 1`,
    [normalizeCountry(country), name]
  );
  if (result.rowCount !== 1 || result.rows[0].active !== true) return pricing;
  const fixed = requireNonNegativeInteger(result.rows[0].fee_eur_cents, 'operator fixed fee');
  const percent = Number(result.rows[0].fee_percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Invalid operator fee percentage.');
  const wholesale = requirePositiveInteger(product.wholesalePriceCents, 'DT One wholesale price in EUR cents');
  return { ...pricing, feeCents: fixed + Math.ceil(wholesale * percent / 100), operatorFeeCents: fixed,
    operatorFeePercent: percent, operatorPricingApplied: true };
}

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

  // Validate provider fee settings before gross-up. A percentage >= 100,
  // non-finite percentage, or invalid fixed fee can otherwise produce a
  // negative/invalid denominator or an unbounded rounding loop.
  const stripeFeePercent = Number(pricing.stripeFeePercent);
  if (!Number.isFinite(stripeFeePercent) || stripeFeePercent < 0 || stripeFeePercent >= 100) {
    throw new Error('Invalid Stripe fee percentage.');
  }
  const stripeFixedFeeCents = requireNonNegativeInteger(
    pricing.stripeFixedFeeCents,
    'Stripe fixed fee'
  );

  // Gross up the customer charge so that the estimated Stripe percentage
  // and fixed fee are covered while preserving the configured app fee.
  const targetNetCents = basePriceCents + feeCents;
  const stripeRate = stripeFeePercent / 100;
  // Start with the algebraic gross-up, then correct for Stripe's
  // percentage-fee rounding. The rounded Stripe fee must never reduce
  // the amount retained below wholesale cost plus the configured app fee.
  let finalPriceCents = Math.ceil(
    (targetNetCents + stripeFixedFeeCents) / (1 - stripeRate)
  );
  let estimatedStripeFeeCents =
    Math.ceil(finalPriceCents * stripeRate) + stripeFixedFeeCents;
  while (finalPriceCents - estimatedStripeFeeCents < targetNetCents) {
    finalPriceCents += 1;
    estimatedStripeFeeCents =
      Math.ceil(finalPriceCents * stripeRate) + stripeFixedFeeCents;
  }

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
    stripeFeePercent,
    stripeFixedFeeCents,
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

    const basePricing = await getPricingSettings(client, country);
    const pricing = await resolveProductPricing(client, country, product.name, product, basePricing);
    const price = calculateFinalPrice(product, pricing);

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
// Quotes may preview inactive, database-mapped products; checkout still requires an enabled product.
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
    const basePricing = await getPricingSettings(client, country);
    const pricing = await resolveProductPricing(client, country, operator, product, basePricing);
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

    const basePricing = await getPricingSettings(client, input.country);
    const pricing = await resolveProductPricing(client, input.country, product.name, product, basePricing);
    const price = calculateFinalPrice(product, pricing);

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
      if (referral.rowCount !== 1 || referral.rows[0].active !== true) {
        throw new Error('This referral code is invalid or inactive.');
      }
      // The reward contract is fixed at €0.07. Fail closed for legacy or
      // manually edited database rows instead of reserving a different amount.
      if (Number(referral.rows[0].reward_eur_cents) !== 7) {
        throw new Error('This referral code has an invalid reward configuration. Please contact support.');
      }
      referralRewardCents = 7;
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

    orderId = createOrderId();
    const orderAccessToken = crypto.randomBytes(32).toString('hex');
    const orderAccessTokenHash = crypto.createHash('sha256').update(orderAccessToken, 'utf8').digest('hex');

    // Store only a hash of the secret used to authorize order-status access.
    await client.query(
      `INSERT INTO orders (
         order_id, country, operator, phone, product_id,
         amount, currency, product_price_cents, fee_cents,
         charge_cents, status, order_access_token_hash, referral_code,
         referral_install_id, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         'awaiting_payment', $11, $12, $13, NOW(), NOW()
       )`,
      [
        orderId, input.country, product.name, input.phone,
        product.id, product.localAmount, product.currency,
        price.basePriceCents, price.feeCents, price.finalPriceCents,
        orderAccessTokenHash, referralCode || null, referralInstallHash,
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

    await persistStripeCheckoutSession(orderId, session.id);

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

    await persistStripeCheckoutSession(orderId, session.id);
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
  if (!externalId || externalId.length > 40 || /\s/.test(externalId)) {
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
      if (/^\d+$/.test(providerTransactionId)) {
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

    // A durable refund reservation wins over later provider callbacks. Once an
    // admin has reserved a refund, a delayed success callback must not race the
    // Stripe refund and turn the same order into a delivered top-up.
    const refundReservation = await client.query(
      `SELECT status FROM refunds WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );
    if (refundReservation.rowCount === 1) {
      // Persist a minimal reconciliation record before acknowledging this
      // callback. Do not store the raw provider payload, which may contain PII.
      // Deduplicate per order as well as provider transaction/status, so an ID reused across orders cannot hide review evidence.
      const refundStatus = String(refundReservation.rows[0].status || 'unknown');
      const reviewEventId = crypto.createHash('sha256')
        .update(`${orderId}:${providerTransactionId}:${providerStatus}`, 'utf8')
        .digest('hex');
      await client.query(
        `INSERT INTO webhook_events (provider, event_id, payload)
         VALUES ('dtone-refund-review', $1, $2::jsonb)
         ON CONFLICT (provider, event_id) DO NOTHING`,
        [reviewEventId, JSON.stringify({
          orderId,
          providerTransactionId,
          providerStatus,
          refundStatus,
        })]
      );
      await client.query('COMMIT');
      console.warn('DT One callback recorded for reconciliation; order state unchanged due to refund reservation.', {
        normalizedProviderStatus: providerStatus,
        refundStatus,
      });
      return res.status(200).json({
        received: true,
        status: 'refund_review',
        ignored: true,
        recordedForReview: true,
      });
    }

    // Ordinary customer orders must have verified Stripe payment evidence
    // before a provider callback can change their state. The only exception is
    // the isolated ATOMA-SANDBOX-TEST route, which is explicitly pre-production
    // and deliberately creates no Stripe payment. Keep this exception tightly
    // scoped to that operator and the exact DT One pre-production host.
    let isolatedSandboxTestOrder = false;
    if (order.operator === 'ATOMA-SANDBOX-TEST') {
      try {
        const callbackBaseUrl = new URL(DTONE_API_BASE_URL);
        isolatedSandboxTestOrder =
          callbackBaseUrl.protocol === 'https:' &&
          callbackBaseUrl.hostname === 'preprod-dvs-api.dtone.com' &&
          (callbackBaseUrl.pathname === '' || callbackBaseUrl.pathname === '/');
      } catch (_) {
        isolatedSandboxTestOrder = false;
      }
    }

    if ((!order.paid_at || !order.stripe_payment_intent_id) && !isolatedSandboxTestOrder) {
      await client.query('ROLLBACK');
      console.warn('DT One callback rejected: verified Stripe payment evidence is missing.', {
        hasPaidAt: Boolean(order.paid_at),
        hasStripePaymentIntentId: Boolean(order.stripe_payment_intent_id),
        isolatedSandboxTestOrder,
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

    // Record or reconcile the referral reward only after final DT One success.
    if (nextStatus === 'completed') {
      await ensureReferralRewardRecorded(order);
    }

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
    throw new Error('Cannot identify the refunded payment.');
  }

  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent.id;

  const refundObject =
    Array.isArray(charge.refunds?.data) && charge.refunds.data.length > 0
      ? charge.refunds.data[charge.refunds.data.length - 1]
      : null;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT order_id, status, charge_cents
       FROM orders
       WHERE stripe_payment_intent_id = $1
       FOR UPDATE`,
      [paymentIntentId]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      console.warn('Refund received but no matching order was found.');
      return;
    }

    const order = orderResult.rows[0];
    const chargeAmount = Number(charge.amount);
    const refundedAmount = Number(charge.amount_refunded || 0);
    const orderChargeAmount = Number(order.charge_cents);
    const currencyMatches = String(charge.currency || '').toLowerCase() === 'eur';
    const chargeAmountMatches =
      Number.isSafeInteger(chargeAmount) &&
      chargeAmount === orderChargeAmount;
    const refundedAmountIsValid =
      Number.isSafeInteger(refundedAmount) &&
      refundedAmount >= 0 &&
      refundedAmount <= chargeAmount;
    const refundEvidenceMatches =
      currencyMatches && chargeAmountMatches && refundedAmountIsValid;
    const fullRefund =
      refundEvidenceMatches &&
      charge.refunded === true &&
      refundedAmount === orderChargeAmount;
    const partialRefund =
      refundEvidenceMatches &&
      refundedAmount > 0 &&
      !fullRefund;
    const refundStatus = !refundEvidenceMatches
      ? 'needs_review'
      : fullRefund
        ? 'succeeded'
        : partialRefund
          ? 'partial'
          : 'pending';
    const refundReason = !refundEvidenceMatches
      ? 'Stripe refund webhook amount/currency did not match the verified EUR order; manual reconciliation required'
      : fullRefund
        ? 'Stripe webhook confirmed full EUR refund'
        : partialRefund
          ? 'Stripe webhook reported partial refund; manual review required'
          : 'Stripe webhook reported no confirmed refund amount; reconciliation required';

    // Never infer a successful refund from charge.refunded alone. The canonical
    // Stripe charge must match the saved EUR order amount, and the refunded
    // amount must be valid and complete before the order can become refunded.
    // Webhook deliveries can arrive out of order. Never downgrade an
    // already-refunded order because an older partial-refund event arrived late.
    if (!['completed', 'refunded'].includes(order.status)) {
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
    } else {
      console.warn(
        'Stripe refund observed for a completed top-up; order retained for manual reconciliation.',
        order.order_id
      );
    }

    // Keep the ledger aligned with verified Stripe evidence. Mismatched or
    // incomplete charge data is held for review rather than marked succeeded.
    await client.query(
      `INSERT INTO refunds (
         order_id, stripe_refund_id, amount_cents, status, reason
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id)
       DO UPDATE SET
         stripe_refund_id = CASE
           WHEN refunds.status = 'succeeded' THEN refunds.stripe_refund_id
           ELSE COALESCE(EXCLUDED.stripe_refund_id, refunds.stripe_refund_id)
         END,
         amount_cents = CASE
           WHEN refunds.status = 'succeeded'
           THEN refunds.amount_cents
           ELSE EXCLUDED.amount_cents
         END,
         status = CASE
           WHEN refunds.status = 'succeeded' THEN refunds.status
           ELSE EXCLUDED.status
         END,
         reason = CASE
           WHEN refunds.status = 'succeeded' THEN refunds.reason
           ELSE EXCLUDED.reason
         END`,
      [
        order.order_id,
        refundObject?.id || null,
        refundedAmount,
        refundStatus,
        refundReason,
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
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

// Customer and admin support-ticket API routes. These use per-order access
// tokens for customer requests and the existing ADMIN_API_KEY for admin actions.
require('./support-routes')({
  app,
  pool,
  requireAdmin,
});

// International customer phone authentication (Twilio Verify, E.164 numbers).
require('./phone-auth').registerPhoneAuthRoutes({ app, pool });



// Small browser page for the owner to run the read-only product check
// without installing an API client. The admin key is entered by the owner
// in their browser and is never stored by this page.
// REFERRAL REWARDS V1 — ADMIN CONTROL + SERVER-SIDE ATTRIBUTION
// All new referral codes are disabled until explicitly activated by admin.
// =====================================================
app.post('/api/admin/referrals/codes', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const body = req.body || {};
  const code = String(body.code || '').trim().toUpperCase();
  const ownerName = String(body.ownerName || '').trim();
  const ownerContact = String(body.ownerContact || '').trim() || null;
  const rewardEurCents = body.rewardEurCents === undefined ? 7 : Number(body.rewardEurCents);
  const maxRewards = body.maxRewards === undefined || body.maxRewards === null || body.maxRewards === '' ? null : Number(body.maxRewards);
  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return res.status(400).json({ error: 'Code must be 4-40 characters: letters, numbers, _ or -.' });
  if (!ownerName || ownerName.length > 120) return res.status(400).json({ error: 'A valid ownerName is required.' });
  if (!Number.isSafeInteger(rewardEurCents) || rewardEurCents !== 7) return res.status(400).json({ error: 'Referral rewards are fixed at €0.07 (7 euro cents).' });
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
    if (!Number.isSafeInteger(reward) || reward !== 7) {
      return res.status(400).json({ error: 'Referral rewards are fixed at €0.07 (7 euro cents).' });
    }
    values.push(7);
    fields.push('reward_eur_cents = ' + String.fromCharCode(36) + values.length);
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

// Delete only referral codes with no historical or financial references.
// If any attribution, ledger entry, or order references the code, preserve history
// and deactivate it instead. The whole decision is serialized in one DB transaction.
app.delete('/api/admin/referrals/codes/:code', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid referral code.' });
  }

  let client;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;

    const locked = await client.query(
      'SELECT code, active FROM referral_codes WHERE code = $1 FOR UPDATE',
      [code]
    );
    if (locked.rowCount !== 1) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'Referral code not found.' });
    }

    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM referral_attributions WHERE referral_code = $1) AS attributions,
         (SELECT COUNT(*)::int FROM referral_ledger WHERE referral_code = $1) AS ledger_entries,
         (SELECT COUNT(*)::int FROM orders WHERE referral_code = $1) AS orders`,
      [code]
    );
    const references = {
      attributions: Number(counts.rows[0].attributions),
      ledgerEntries: Number(counts.rows[0].ledger_entries),
      orders: Number(counts.rows[0].orders),
    };
    const hasHistory = Object.values(references).some((count) => count > 0);

    if (hasHistory) {
      const archived = await client.query(
        'UPDATE referral_codes SET active = FALSE WHERE code = $1 RETURNING code, active',
        [code]
      );
      await client.query('COMMIT');
      transactionOpen = false;
      return res.json({
        deleted: false,
        archived: true,
        reason: 'Referral history exists; the code was disabled and historical records were preserved.',
        references,
        referral: archived.rows[0],
      });
    }

    const deleted = await client.query(
      'DELETE FROM referral_codes WHERE code = $1 RETURNING code',
      [code]
    );
    if (deleted.rowCount !== 1) {
      throw new Error('Referral code changed while deletion was being finalized.');
    }
    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ deleted: true, archived: false, references, code: deleted.rows[0].code });
  } catch (error) {
    if (transactionOpen && client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Referral code delete/archive failed:', error.message);
    return res.status(500).json({ error: 'Could not safely delete or archive referral code.' });
  } finally {
    if (client) client.release();
  }
});

// Simple mobile-friendly admin check dashboard. The page itself is public,
 // but all data endpoints require the admin API key. Read-only checks only.
app.get('/admin', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  return res.sendFile(require('path').join(__dirname, 'admin-panel.html'));
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
<p>Read-only DT One product check. Enter any supported DT One product ID to verify provider details and saved database pricing. This does not create a top-up or enable the product.</p>
<form id="check">
<label for="productIdInput">DT One product ID</label>
<input id="productIdInput" type="number" min="1" step="1" value="7194" required>
<label for="key">Admin API key</label>
<input id="key" type="password" autocomplete="off" required>
<small>The key is sent only to this PGNT backend for this request and is not saved by this page. Do not share it in chat or screenshots.</small>
<button type="submit">Verify selected product (read-only)</button><button type="button" id="checkDatabase">Verify database price and fees (read-only)</button><button type="button" id="importCatalogProduct">Import verified product into catalog (keep disabled)</button><button type="button" id="refreshCatalogPrices">Refresh verified prices for existing disabled product</button><label for="catalogCountry">Destination country</label><select id="catalogCountry" style="width:100%;padding:12px;font:inherit"><option value="AFG">Afghanistan (AFN)</option><option value="PAK">Pakistan (PKR)</option><option value="IND">India (INR)</option><option value="BGD">Bangladesh (BDT)</option></select><label for="operatorSearch">Network (optional)</label><select id="operatorSearch" style="width:100%;padding:12px;font:inherit"><option value="ALL">All networks in selected country</option></select><button type="button" id="discoverOperators">Load network list (read-only)</button><button type="button" id="discover">Find products in selected country</button>
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
<button type="button" id="checkSandboxStatus">Check saved order status</button><button type="button" id="checkStripePaymentStatus">Check Stripe payment status (read-only)</button><button type="button" id="checkStripeCandidates">Check additional Stripe evidence (read-only)</button><small>Scans bounded Stripe records and saved webhook evidence. It never links payments, refunds, or submits a top-up.</small><button type="button" id="checkLiveDtOneStatus">Query DT One live status (read-only)</button><small>This queries DT One directly for the entered external/order ID. It does not create, retry, or modify a transaction.</small>
<button type="button" id="loadReviewQueue">Load admin review queue (read-only)</button>
<label for="archiveReason">Archive note (required)</label><input id="archiveReason" autocomplete="off" placeholder="Stripe checked: no payment; DT One final DECLINED">
<label style="display:flex;gap:8px;align-items:center"><input id="confirmNoStripePayment" type="checkbox" style="width:auto"> I checked Stripe Dashboard and confirmed no payment was collected for this sandbox order</label>
<button type="button" id="archiveDeclinedSandbox">Archive declined sandbox order (keeps history)</button>
</form>
<hr>
<h2>Stripe + DT One end-to-end sandbox</h2>
<p>Admin-only test. Uses Stripe test mode and DT One pre-production with a fixed test recipient. A successful test payment submits one sandbox top-up. It does not activate the ATOMA catalog product. Do not use real card details.</p>
<label style="display:flex;gap:8px;align-items:center"><input id="confirmStripeDtoneSandbox" type="checkbox" style="width:auto"> I confirm this is a Stripe TEST + DT One PRE-PRODUCTION test</label>
<button type="button" id="runStripeDtoneSandbox">Create test checkout</button>
<h2>Referral code administration</h2>
<p>Create referral codes, activate or deactivate them, and review attributed installs and reward totals. Every eligible referral reward is fixed at €0.07 after the referred customer’s first successful top-up. New codes are disabled until you activate them.</p>
<label for="referralCode">Referral code (4–40 letters, numbers, _ or -)</label><input id="referralCode" maxlength="40" autocomplete="off" placeholder="e.g. FRIEND2026">
<label for="referralOwner">Code owner name</label><input id="referralOwner" maxlength="120" autocomplete="name" placeholder="Owner or partner name">
<label for="referralContact">Owner contact (optional)</label><input id="referralContact" maxlength="200" autocomplete="off" placeholder="Optional contact reference">
<label for="referralMaxRewards">Maximum rewards (optional; blank = unlimited)</label><input id="referralMaxRewards" type="number" min="0" step="1" placeholder="e.g. 100">
<p><strong>Reward per eligible referral: €0.07 (fixed)</strong></p>
<button type="button" id="createReferralCode">Create referral code (starts disabled)</button>
<button type="button" id="loadReferralReport">Load referral report</button>
<div id="referralReport" aria-live="polite"></div>
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
<h2>Operator fee controls</h2>
<p>Set a fixed EUR fee and an additional percentage for each network. These settings replace the country-wide app fee when enabled. New quotes only; no payment or top-up is performed.</p>
<label for="operatorPricingCountry">Country</label>
<select id="operatorPricingCountry" style="width:100%;padding:12px;font:inherit">
<option value="AF">Afghanistan</option><option value="PK">Pakistan</option><option value="IN">India</option><option value="BD">Bangladesh</option></select>
<button type="button" id="loadOperatorPricing">Load network fees</button>
<div id="operatorPricingRows" style="display:grid;gap:12px;margin-top:12px"></div>
<small>To save: enter the admin API key, load network fees, change values, then press Save on that network. Keep a network inactive to use the country-wide fee.</small>
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
 const productId=String(document.getElementById('productIdInput').value||'').trim();
 if(!/^[1-9]\\d*$/.test(productId)){result.textContent='Enter a valid positive DT One product ID.';return;}
 result.textContent='Checking DT One pre-production for product '+productId+'…';
 try{
  const data=await adminRequest('/api/admin/dtone/products/'+encodeURIComponent(productId));
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){
  result.textContent='Could not verify DT One product: '+error.message;
 }finally{key.value='';}
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
  afnRate.value=Number(saved.local_currency_per_eur ?? saved.afn_per_eur);
  bonusPercent.value=Number(saved.bonus_percent);
  stripeFeePercent.value=Number(saved.stripe_fee_percent);
  stripeFixedFee.value=(Number(saved.stripe_fixed_fee_cents)/100).toFixed(2);
  pricingActive.checked=saved.active===true;
  result.textContent=JSON.stringify({loaded:true,country:saved.country,localCurrency:countryCurrencies[saved.country],appFeeEur:Number(saved.fee_eur_cents)/100,localCurrencyPerEur:Number(saved.local_currency_per_eur ?? saved.afn_per_eur),legacyBonusPercent:Number(saved.bonus_percent),active:saved.active,stripeFeePercent:saved.stripe_fee_percent,stripeFixedFeeCents:saved.stripe_fixed_fee_cents},null,2);
 }catch(error){result.textContent='Could not load pricing: '+error.message;}
});
savePricing.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 if(!loadedCountryPricing||loadedCountryPricing.country!==pricingCountry.value){result.textContent='First load the selected country settings and review them.';return;}
 const fee=Number(feeEur.value),rate=Number(afnRate.value),bonus=Number(bonusPercent.value),stripeRate=Number(stripeFeePercent.value),stripeFixed=Number(stripeFixedFee.value);
 if(!Number.isFinite(fee)||fee<0||fee>1000||!Number.isFinite(rate)||rate<=0||!Number.isFinite(bonus)||bonus<0||bonus>100||!Number.isFinite(stripeRate)||stripeRate<0||stripeRate>=100||!Number.isFinite(stripeFixed)||stripeFixed<0||stripeFixed>100){result.textContent='Check app fee, local-currency-per-EUR rate, and Stripe fee values.';return;}
 const selectedCountry=pricingCountry.value;
 if(!confirm('Save '+selectedCountry+' pricing settings? App fee: €'+fee.toFixed(2)+', '+countryCurrencies[selectedCountry]+'/EUR: '+rate+', estimated Stripe fee: '+stripeRate+'% + €'+stripeFixed.toFixed(2)+'. General bonus remains disabled. This will not activate any product.'))return;
 result.textContent='Saving selected country pricing settings…';
 try{
  const data=await adminRequest('/api/admin/pricing/'+selectedCountry,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({feeEurCents:Math.round(fee*100),localCurrencyPerEur:rate,bonusPercent:0,stripeFeePercent:stripeRate,stripeFixedFeeCents:Math.round(stripeFixed*100),active:pricingActive.checked})});
  loadedCountryPricing=data.pricing;
  result.textContent=JSON.stringify({saved:true,pricing:data.pricing,note:data.note},null,2);
 }catch(error){result.textContent='Could not save pricing: '+error.message;}
 finally{key.value='';}
});
const operatorPricingCountry=document.getElementById('operatorPricingCountry');
const operatorPricingRows=document.getElementById('operatorPricingRows');
const operatorNames={AF:['AWCC','Roshan','Etisalat','Salaam','ATOMA'],PK:['Jazz','Zong','Telenor','Ufone'],IN:['Airtel','Jio','Vi','BSNL'],BD:['Grameenphone','Robi','Banglalink','Teletalk']};
document.getElementById('loadOperatorPricing').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 operatorPricingRows.replaceChildren();
 result.textContent='Loading network fees…';
 try{
  const data=await adminRequest('/api/admin/operator-pricing?country='+encodeURIComponent(operatorPricingCountry.value));
  for(const item of data.operators||[]){
   const card=document.createElement('section');card.style.cssText='border:1px solid #bbb;border-radius:10px;padding:12px;display:grid;gap:8px';
   const heading=document.createElement('strong');heading.textContent=item.operator;card.appendChild(heading);
   const feeLabel=document.createElement('label');feeLabel.textContent='Fixed fee (EUR)';
   const fee=document.createElement('input');fee.type='number';fee.min='0';fee.max='1000';fee.step='0.01';fee.value=(Number(item.fee_eur_cents)/100).toFixed(2);feeLabel.appendChild(fee);card.appendChild(feeLabel);
   const percentLabel=document.createElement('label');percentLabel.textContent='Extra fee (%)';
   const percent=document.createElement('input');percent.type='number';percent.min='0';percent.max='100';percent.step='0.01';percent.value=Number(item.fee_percent);percentLabel.appendChild(percent);card.appendChild(percentLabel);
   const activeLabel=document.createElement('label');activeLabel.style.cssText='display:flex;gap:8px;align-items:center';
   const active=document.createElement('input');active.type='checkbox';active.style.width='auto';active.checked=item.active===true;activeLabel.append(active,' Use this network-specific fee');card.appendChild(activeLabel);
   const save=document.createElement('button');save.type='button';save.textContent='Save '+item.operator+' settings';
   save.addEventListener('click',async()=>{
    if(!key.value){result.textContent='Enter the admin API key first.';return;}
    const feeValue=Number(fee.value),percentValue=Number(percent.value);
    if(!Number.isFinite(feeValue)||feeValue<0||feeValue>1000||!Number.isFinite(percentValue)||percentValue<0||percentValue>100){result.textContent='Check fee values for '+item.operator+'.';return;}
    if(!confirm('Save fee settings for '+item.operator+' in '+operatorPricingCountry.value+'?'))return;
    result.textContent='Saving '+item.operator+' fee settings…';
    try{
     const saved=await adminRequest('/api/admin/operator-pricing/'+encodeURIComponent(operatorPricingCountry.value)+'/'+encodeURIComponent(item.operator),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({feeEurCents:Math.round(feeValue*100),feePercent:percentValue,active:active.checked})});
     result.textContent=JSON.stringify({saved:true,operatorPricing:saved.operatorPricing,note:saved.note},null,2);
    }catch(error){result.textContent='Could not save '+item.operator+': '+error.message;}
   });
   card.appendChild(save);operatorPricingRows.appendChild(card);
  }
  result.textContent='Loaded '+(data.operators||[]).length+' network settings for '+data.country+'. Review carefully before saving.';
 }catch(error){result.textContent='Could not load network fees: '+error.message;}
 finally{key.value='';}
});
operatorPricingCountry.addEventListener('change',()=>operatorPricingRows.replaceChildren());
document.getElementById('importCatalogProduct').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const productId=String(document.getElementById('productIdInput').value||'').trim();
 if(!/^[1-9]\\d*$/.test(productId)){result.textContent='Enter a valid positive DT One product ID.';return;}
 if(!confirm('Import this verified provider product into the local catalog as DISABLED? No payment or top-up will be performed.')) return;
 result.textContent='Verifying provider product and importing it as disabled…';
 try{const data=await adminRequest('/api/admin/catalog/'+encodeURIComponent(productId)+'/import',{method:'POST'});result.textContent=JSON.stringify(data,null,2);}
 catch(error){result.textContent='Could not import catalog product: '+error.message;}
 finally{key.value='';}
});
document.getElementById('refreshCatalogPrices').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const productId=String(document.getElementById('productIdInput').value||'').trim();
 if(!/^[1-9]\\d*$/.test(productId)){result.textContent='Enter a valid positive DT One product ID.';return;}
 if(!confirm('Refresh provider retail and wholesale prices for this existing product only if it is DISABLED and its identity matches DT One? Pricing settings will not change; no payment/top-up will be performed.')) return;
 result.textContent='Verifying DT One and refreshing prices for disabled product '+productId+'…';
 try{const data=await adminRequest('/api/admin/catalog/'+encodeURIComponent(productId)+'/refresh-prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmPriceRefresh:true})});result.textContent=JSON.stringify(data,null,2);}
 catch(error){result.textContent='Could not refresh catalog prices: '+error.message;}
 finally{key.value='';}
});
checkDatabase.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const productId=String(document.getElementById('productIdInput').value||'').trim();
 if(!/^[1-9]\\d*$/.test(productId)){result.textContent='Enter a valid positive DT One product ID.';return;}
 result.textContent='Reading saved product '+productId+' and pricing settings…';
 try{const data=await adminRequest('/api/admin/catalog/'+encodeURIComponent(productId)+'/pricing');result.textContent=JSON.stringify(data,null,2);}
 catch(error){result.textContent='Could not verify database pricing: '+error.message;}
 finally{key.value='';}
});
const catalogCountry=document.getElementById('catalogCountry');
const operatorSearch=document.getElementById('operatorSearch');
const countryNames={AFG:'Afghanistan',PAK:'Pakistan',IND:'India',BGD:'Bangladesh'};
const operatorOptions={AFG:['ROSHAN','ETISALAT','AWCC','SALAAM','ATOMA'],PAK:['JAZZ','ZONG','TELENOR','UFONE'],IND:['AIRTEL','JIO','VI','BSNL'],BGD:['GRAMEENPHONE','ROBI','BANGLALINK','TELETALK']};
function refreshCatalogOperators(){const country=catalogCountry.value;operatorSearch.replaceChildren(new Option('All networks in selected country','ALL'));for(const name of (operatorOptions[country]||[]))operatorSearch.add(new Option(name,name));}
catalogCountry.addEventListener('change',refreshCatalogOperators);
refreshCatalogOperators();
document.getElementById('discoverOperators').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const button=document.getElementById('discoverOperators');
 button.disabled=true;
 try {
  const country=document.getElementById('catalogCountry').value;
  result.textContent='Loading the read-only DT One network list…';
  const response=await fetch('/api/admin/dtone/operators?country_iso_code='+encodeURIComponent(country),{headers:{'x-admin-api-key':key.value,'Accept':'application/json'},cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.verified)throw new Error(data.error||('HTTP '+response.status));
  const select=document.getElementById('operatorSearch');
  select.replaceChildren(new Option('All networks in selected country','ALL'));
  for(const operator of data.operators||[])select.add(new Option(operator.name,operator.name));
  result.textContent=JSON.stringify({environment:data.environment,countryIsoCode:data.countryIsoCode,operatorCount:data.operatorCount,operators:data.operators,transactionCreated:false,catalogActivation:'unchanged'},null,2);
 } catch(error) { result.textContent='Could not load network list: '+error.message; }
 finally { key.value=''; button.disabled=false; }
});
discover.addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 result.textContent='Searching DT One pre-production catalog…';
 try{
  const selectedCountry=catalogCountry.value;
  const selectedOperator=operatorSearch.value;
  const params=new URLSearchParams({country_iso_code:selectedCountry});
  if(selectedOperator!=='ALL')params.set('operator',selectedOperator);
  const response=await fetch('/api/admin/dtone/products?'+params.toString(),{headers:{'x-admin-api-key':key.value},cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.verified){result.textContent=JSON.stringify(data,null,2);return;}
  const products=Array.isArray(data.products)?data.products:[];
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const operatorOf=(p)=>p?.operator?.name||'Unknown operator';
  const amountOf=(p)=>p?.destination?.amount??p?.benefits?.[0]?.amount?.total_excluding_tax??p?.benefits?.[0]?.amount?.base??'—';
  const unitOf=(p)=>p?.destination?.unit||p?.benefits?.[0]?.amount?.unit||p?.benefits?.[0]?.unit||'';
  const targetAmounts=[100,150,200,250,500,1000];
  const numericAmount=(p)=>{const n=Number(amountOf(p));return Number.isFinite(n)?n:null;};
  const localCurrency={AFG:'AFN',PAK:'PKR',IND:'INR',BGD:'BDT'}[selectedCountry]||'';
  const isTargetAmount=(p)=>{const n=numericAmount(p);const unit=String(unitOf(p)||'').toUpperCase();return selectedCountry!=='AFG'||(targetAmounts.includes(n)&&(unit===''||unit.includes(localCurrency)));};
  const wholesaleOf=(p)=>p?.prices?.wholesale?.amount;
  const retailOf=(p)=>p?.prices?.retail?.amount;
  const eur=(value)=>value!=null&&Number.isFinite(Number(value))?'€'+Number(value).toFixed(2):'—';
  const denominationKey=(p)=>[operatorOf(p).trim().toUpperCase(),amountOf(p),unitOf(p).trim().toUpperCase()].join('|');
  const denominationCounts=new Map();
  for(const p of products){const k=denominationKey(p);denominationCounts.set(k,(denominationCounts.get(k)||0)+1);}
  const duplicateDenominations=[...denominationCounts.values()].filter(n=>n>1).length;
  const networkAliases=selectedCountry==='AFG'?{
   AWCC:['AWCC','AFGHAN WIRELESS'],Roshan:['ROSHAN'],Etisalat:['ETISALAT'],Salaam:['SALAAM','SALAM'],ATOMA:['ATOMA']
  }:selectedCountry==='PAK'?{Jazz:['JAZZ'],Zong:['ZONG'],Telenor:['TELENOR'],Ufone:['UFONE']}:selectedCountry==='IND'?{Airtel:['AIRTEL'],Jio:['JIO'],Vi:['VODAFONE','VI'],BSNL:['BSNL']}:{Grameenphone:['GRAMEENPHONE'],Robi:['ROBI'],Banglalink:['BANGLALINK'],Teletalk:['TELETALK']};
  const coverageRows=Object.entries(networkAliases).map(([network,aliases])=>{
   const networkProducts=products.filter(p=>aliases.some(alias=>operatorOf(p).toUpperCase().includes(alias)));
   return '<tr><th style="text-align:left;padding:7px;border-bottom:1px solid #ddd">'+esc(network)+'</th>'+
    targetAmounts.map(amount=>{
     const found=networkProducts.filter(p=>numericAmount(p)===amount&&isTargetAmount(p));
     return '<td style="padding:7px;text-align:center;border-bottom:1px solid #ddd">'+(found.length?'<span title="DT One product ID(s): '+esc(found.map(p=>p.id).join(', '))+'">'+found.length+' found</span>':'—')+'</td>';
    }).join('')+'</tr>';
  }).join('');
  result.innerHTML='<section style="background:#f7f7f7;border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0">'+
   '<h2 style="margin:0 0 8px">'+esc(countryNames[selectedCountry]||selectedCountry)+' DT One catalog</h2>'+
   '<p><b>Environment:</b> '+esc(data.environment)+' · <b>Products:</b> '+esc(data.resultCount)+' · <b>Provider pages checked:</b> '+esc(data.providerPagesChecked)+'</p>'+
   '<p><b>Repeated network/amount combinations:</b> '+duplicateDenominations+'. These are flagged for review only; products are not automatically removed.</p>'+
   '<p style="color:#555">Read-only pre-production data. No product activation or transaction was performed.</p>'+
   '<h3>Target denomination coverage (provider results)</h3>'+
   '<p style="color:#555;font-size:13px">Counts are based only on products returned by the configured DT One catalog search. A dash means no matching product was found in this result set; it does not prove the operator never offers that denomination. Confirm local currency and provider amounts before import.</p>'+
   '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:7px;border-bottom:1px solid #ddd">Network</th>'+targetAmounts.map(n=>'<th style="padding:7px;border-bottom:1px solid #ddd">'+n+' '+esc(localCurrency)+'</th>').join('')+'</tr></thead><tbody>'+coverageRows+'</tbody></table></div>'+
   '<label for="catalogFilter">Search by network, product name, AFN amount or ID</label>'+
   '<input id="catalogFilter" type="search" placeholder="e.g. Roshan, 150, 6153" style="width:100%;padding:12px;font:inherit">'+
   '<fieldset style="margin:10px 0;padding:10px;border:1px solid #ddd"><legend>Target denominations ('+esc(localCurrency)+')</legend>'+targetAmounts.map(n=>'<label style="display:inline-flex;align-items:center;gap:5px;margin:5px 12px 5px 0"><input type="checkbox" class="targetAmountFilter" value="'+n+'" checked style="width:auto">'+n+'</label>').join('')+'<label style="display:inline-flex;align-items:center;gap:5px;margin:5px 12px 5px 0"><input type="checkbox" id="showOtherAmounts" '+(selectedCountry==='AFG'?'':'checked')+' style="width:auto">Show other denominations</label></fieldset>'+
   '<p id="catalogCount" style="margin:10px 0"></p>'+
   '<button type="button" id="bulkImportDisabled" style="background:#333">Import selected products as DISABLED</button>'+
   '<p style="color:#555;font-size:13px">Bulk import re-verifies each selected product with DT One and uses the existing safe import endpoint. Every imported product stays disabled. Conflicts are skipped and reported.</p>'+
   '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>'+
   '<th style="text-align:left;padding:8px;border-bottom:1px solid #ccc">Select</th>'+
   '<th style="text-align:left;padding:8px;border-bottom:1px solid #ccc">Network</th>'+
   '<th style="text-align:left;padding:8px;border-bottom:1px solid #ccc">Product</th>'+
   '<th style="text-align:right;padding:8px;border-bottom:1px solid #ccc">Wholesale</th>'+
   '<th style="text-align:right;padding:8px;border-bottom:1px solid #ccc">Retail</th>'+
   '<th style="text-align:right;padding:8px;border-bottom:1px solid #ccc">DT One ID</th>'+
   '<th style="text-align:left;padding:8px;border-bottom:1px solid #ccc">Review</th></tr></thead><tbody id="catalogRows"></tbody></table></div>'+
   '<p style="color:#555;font-size:13px">Retail minus wholesale is not net profit; Stripe fees and the app fee still need to be included.</p></section>';
  const filter=document.getElementById('catalogFilter');
  const rows=document.getElementById('catalogRows');
  const count=document.getElementById('catalogCount');
  const renderRows=()=>{
   const q=filter.value.trim().toLowerCase();
   const selectedAmounts=[...document.querySelectorAll('.targetAmountFilter:checked')].map(el=>Number(el.value));
   const showOther=document.getElementById('showOtherAmounts').checked;
   const matches=products.filter(p=>{const textMatch=[operatorOf(p),p?.name,amountOf(p),unitOf(p),p?.id].join(' ').toLowerCase().includes(q);const n=numericAmount(p);const targetMatch=showOther||(targetAmounts.includes(n)&&selectedAmounts.includes(n)&&isTargetAmount(p));return textMatch&&targetMatch;});
   count.textContent='Showing '+Math.min(matches.length,100)+' of '+matches.length+' matching products (maximum 100 displayed at once).';
   rows.innerHTML=matches.slice(0,100).map(p=>'<tr>'+
    '<td style="padding:8px;border-bottom:1px solid #eee"><input type="checkbox" class="bulkProductSelect" data-product-id="'+esc(p?.id)+'" aria-label="Select product '+esc(p?.id)+'" style="width:auto"></td>'+
    '<td style="padding:8px;border-bottom:1px solid #eee">'+esc(operatorOf(p))+'</td>'+
    '<td style="padding:8px;border-bottom:1px solid #eee">'+esc(p?.name||((amountOf(p)+' '+unitOf(p)).trim()))+'<br><small>'+esc(amountOf(p)+' '+unitOf(p))+'</small></td>'+
    '<td style="padding:8px;text-align:right;border-bottom:1px solid #eee">'+eur(wholesaleOf(p))+'</td>'+
    '<td style="padding:8px;text-align:right;border-bottom:1px solid #eee">'+eur(retailOf(p))+'</td>'+
    '<td style="padding:8px;text-align:right;border-bottom:1px solid #eee">'+esc(p?.id)+'</td>'+
    '<td style="padding:8px;border-bottom:1px solid #eee">'+(denominationCounts.get(denominationKey(p))>1?'<b>Check duplicate</b>':'—')+'</td></tr>').join('');
   if(!matches.length)rows.innerHTML='<tr><td colspan="7" style="padding:12px">No products match that search.</td></tr>';
  };
  filter.addEventListener('input',renderRows);
  document.querySelectorAll('.targetAmountFilter').forEach(el=>el.addEventListener('change',renderRows));
  document.getElementById('showOtherAmounts').addEventListener('change',renderRows);
  renderRows();
  document.getElementById('bulkImportDisabled').addEventListener('click',async()=>{
   if(!key.value){result.textContent='Enter the admin API key first.';return;}
   const ids=[...document.querySelectorAll('.bulkProductSelect:checked')].map(el=>String(el.dataset.productId||'')).filter(id=>/^[1-9]\\d*$/.test(id));
   if(!ids.length){result.textContent='Select at least one product to import.';return;}
   if(ids.length>100){result.textContent='Select no more than 100 products at a time.';return;}
   if(!confirm('Import '+ids.length+' selected DT One products into the local catalog as DISABLED? Products will be re-verified one by one. No payment or top-up will be performed.'))return;
   const button=document.getElementById('bulkImportDisabled');button.disabled=true;
   const outcomes=[];
   try{
    for(let i=0;i<ids.length;i++){
     const id=ids[i];result.textContent='Verifying and importing product '+id+' ('+(i+1)+'/'+ids.length+')…';
     try{const item=await adminRequest('/api/admin/catalog/'+encodeURIComponent(id)+'/import',{method:'POST'});outcomes.push({productId:id,imported:Boolean(item.imported),alreadyRegistered:Boolean(item.alreadyRegistered),error:item.error||null,product:item.product||null});}
     catch(error){outcomes.push({productId:id,imported:false,error:error.message});}
    }
    const imported=outcomes.filter(x=>x.imported).length;const skipped=outcomes.length-imported;
    result.textContent=JSON.stringify({bulkImportComplete:true,selected:ids.length,importedDisabled:imported,skippedOrFailed:skipped,activationChanged:false,transactionsCreated:false,results:outcomes},null,2);
   }finally{button.disabled=false;key.value='';}
  });
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

document.getElementById('archiveDeclinedSandbox').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const id=orderId.value.trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)){result.textContent='Enter a valid order UUID first.';return;}
 if(!document.getElementById('confirmNoStripePayment').checked){result.textContent='Confirm that you checked Stripe Dashboard and no payment was collected.';return;}
 const reason=document.getElementById('archiveReason').value.trim();
 if(reason.length<12){result.textContent='Enter a review note (at least 12 characters).';return;}
 if(!confirm('Archive this declined ATOMA sandbox order? It will be hidden from the review queue, not deleted. This does not change payment status, issue a refund, or resubmit a top-up.'))return;
 const button=document.getElementById('archiveDeclinedSandbox');
 button.disabled=true;result.textContent='Archiving sandbox order while retaining history…';
 try{
  const data=await adminRequest('/api/admin/orders/'+encodeURIComponent(id)+'/archive-declined-sandbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmNoStripePayment:true,reason})});
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){result.textContent='Archive failed: '+error.message;}
 finally{key.value='';button.disabled=false;document.getElementById('confirmNoStripePayment').checked=false;}
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
document.getElementById('checkStripeCandidates').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const id=orderId.value.trim();
 if(!id){result.textContent='Enter the existing order ID first.';return;}
 if(!/^[0-9a-f-]{36}$/i.test(id)){result.textContent='Enter a valid order UUID.';return;}
 const button=document.getElementById('checkStripeCandidates');
 result.textContent='Checking additional Stripe evidence and saved webhook events (read-only)…';
 button.disabled=true;
 try{
  const data=await adminRequest('/api/admin/orders/'+encodeURIComponent(id)+'/stripe-candidates');
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){result.textContent='Could not load additional Stripe evidence: '+error.message;}
 finally{key.value='';button.disabled=false;}
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

document.getElementById('createReferralCode').addEventListener('click',async()=>{
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const code=document.getElementById('referralCode').value.trim().toUpperCase();
 const ownerName=document.getElementById('referralOwner').value.trim();
 const ownerContact=document.getElementById('referralContact').value.trim();
 const maxText=document.getElementById('referralMaxRewards').value.trim();
 if(!/^[A-Z0-9_-]{4,40}$/.test(code)){result.textContent='Referral code must be 4–40 letters, numbers, _ or -.';return;}
 if(!ownerName||ownerName.length>120){result.textContent='Enter a valid code owner name.';return;}
 const payload={code,ownerName,ownerContact,rewardEurCents:7,maxRewards:maxText===''?null:Number(maxText)};
 if(maxText!==''&&(!Number.isSafeInteger(payload.maxRewards)||payload.maxRewards<0)){result.textContent='Maximum rewards must be a non-negative whole number or blank.';return;}
 if(!confirm('Create referral code '+code+' with a fixed €0.07 reward? The code will remain DISABLED until you activate it.'))return;
 const button=document.getElementById('createReferralCode');button.disabled=true;
 try{
  const data=await adminRequest('/api/admin/referrals/codes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  result.textContent=JSON.stringify({created:true,activationRequired:data.activationRequired,referral:data.referral},null,2);
  await refreshReferralReport();
 }catch(error){result.textContent='Could not create referral code: '+error.message;}
 finally{key.value='';button.disabled=false;}
});
async function refreshReferralReport(){
 if(!key.value){result.textContent='Enter the admin API key first.';return;}
 const host=document.getElementById('referralReport');
 host.replaceChildren(makeTicketElement('p','Loading referral report…'));
 const button=document.getElementById('loadReferralReport');button.disabled=true;
 try{
  const data=await adminRequest('/api/admin/referrals');
  host.replaceChildren();
  const rows=Array.isArray(data.referrals)?data.referrals:[];
  if(!rows.length){host.append(makeTicketElement('p','No referral codes have been created yet.'));return;}
  for(const ref of rows){
   const card=makeTicketElement('section',undefined,'ticket-card');
   card.append(makeTicketElement('h3',ref.code+' — '+ref.owner_name));
   const inviteUrl='pgntasian://referral?code='+encodeURIComponent(ref.code);
   const copyInvite=makeTicketElement('button','Copy app invite link');
   copyInvite.type='button';
   copyInvite.addEventListener('click',async()=>{
    if(!ref.active){result.textContent='Activate this referral code before sharing its invite link.';return;}
    try{
     await navigator.clipboard.writeText(inviteUrl);
     result.textContent='App invite link copied: '+inviteUrl+'\nThis opens the app only when PGNT ASIAN TOPUP is installed; Play Store install attribution is not included yet.';
    }catch(error){
     result.textContent='Copy was unavailable. Copy this invite link manually: '+inviteUrl+'\nThis opens the app only when PGNT ASIAN TOPUP is installed; Play Store install attribution is not included yet.';
    }
   });
   card.append(copyInvite);
   card.append(makeTicketElement('p','Status: '+(ref.active?'ACTIVE':'DISABLED')+' | Reward: €'+(Number(ref.reward_eur_cents||0)/100).toFixed(2)));
   card.append(makeTicketElement('p','Attributed installs: '+ref.attributed_installs+' | Eligible rewards: '+ref.reward_eligible+' | Paid rewards: '+ref.rewards_paid));
   card.append(makeTicketElement('p','Reward ledger total: €'+(Number(ref.reward_total_eur_cents||0)/100).toFixed(2)+' | Cap: '+(ref.max_rewards===null?'unlimited':ref.max_rewards)));
   const toggle=makeTicketElement('button',ref.active?'Deactivate code':'Activate code');
   toggle.type='button';toggle.addEventListener('click',async()=>{
    if(!key.value){result.textContent='Enter the admin API key again before changing a code.';return;}
    if(!confirm((ref.active?'Deactivate':'Activate')+' referral code '+ref.code+'?'))return;
    toggle.disabled=true;
    try{
     const changed=await adminRequest('/api/admin/referrals/codes/'+encodeURIComponent(ref.code),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!ref.active})});
     result.textContent=JSON.stringify({updated:true,referral:changed.referral},null,2);
     await refreshReferralReport();
    }catch(error){result.textContent='Could not update referral code: '+error.message;toggle.disabled=false;}
   });
   const remove=makeTicketElement('button','Delete / archive code');
   remove.type='button';remove.addEventListener('click',async()=>{
    if(!key.value){result.textContent='Enter the admin API key again before deleting or archiving a code.';return;}
    if(!confirm('Remove '+ref.code+'? If any attribution, ledger, or order history exists, the code will only be disabled and history preserved.'))return;
    remove.disabled=true;
    try{
     const outcome=await adminRequest('/api/admin/referrals/codes/'+encodeURIComponent(ref.code),{method:'DELETE'});
     result.textContent=JSON.stringify(outcome,null,2);
     await refreshReferralReport();
    }catch(error){result.textContent='Could not delete/archive referral code: '+error.message;remove.disabled=false;}
   });
   card.append(toggle);card.append(remove);host.append(card);
  }
  host.append(makeTicketElement('small',data.rewardRule||'Rewards are fixed at €0.07 and remain pending until admin approval.'));
 }catch(error){host.replaceChildren(makeTicketElement('p','Could not load referral report: '+error.message));}
 finally{key.value='';button.disabled=false;}
}
document.getElementById('loadReferralReport').addEventListener('click',refreshReferralReport);

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


// Refresh only the provider prices for an existing DISABLED catalog product.
// Requires an explicit confirmation and verifies the complete product identity with DT One.
// Does not activate the product, alter pricing settings, or create payments/top-ups.
app.post('/api/admin/catalog/:productId/refresh-prices', express.json(), requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ refreshed: false, error: 'Database is not configured.' });
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ refreshed: false, error: 'A valid product ID is required.' });
  }
  if (req.body?.confirmPriceRefresh !== true) {
    return res.status(400).json({
      refreshed: false,
      confirmationRequired: true,
      error: 'Explicit price-refresh confirmation is required. Send confirmPriceRefresh: true.',
    });
  }
  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    return res.status(503).json({ refreshed: false, error: 'DT One credentials are not configured.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, product_id, country, operator, amount, currency, price_eur_cents, wholesale_price_eur_cents, active FROM product_catalog WHERE product_id = $1 FOR UPDATE',
      [productId]
    );
    if (currentResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      return res.status(404).json({ refreshed: false, error: 'Catalog product was not found.' });
    }
    const current = currentResult.rows[0];
    if (current.active === true) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        refreshed: false,
        activeProductBlocked: true,
        error: 'Price refresh is allowed only for disabled products. No values were changed.',
      });
    }

    const response = await fetch(`${DTONE_API_BASE_URL}/v1/products/${productId}`, {
      method: 'GET',
      headers: { Authorization: getDtOneAuthHeader(), Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const responseText = await response.text();
    let providerProduct = null;
    try { providerProduct = responseText ? JSON.parse(responseText) : null; } catch (_) {}
    if (!response.ok || !providerProduct || Number(providerProduct.id) !== productId) {
      await client.query('ROLLBACK');
      return res.status(response.status === 404 ? 404 : 502).json({
        refreshed: false, error: 'DT One could not verify this product. No catalog values were changed.',
        productId, providerStatus: response.status,
      });
    }

    const iso = String(providerProduct.operator?.country?.iso_code || '').toUpperCase();
    const countryMap = { AFG: 'AF', PAK: 'PK', IND: 'IN', BGD: 'BD' };
    const providerCountry = countryMap[iso];
    const providerOperator = String(providerProduct.operator?.name || '').trim();
    const providerCurrency = String(providerProduct.destination?.unit || providerProduct.benefits?.[0]?.amount?.unit || '').toUpperCase();
    const providerAmount = Number(providerProduct.destination?.amount ?? providerProduct.benefits?.[0]?.amount?.base);
    const retailEur = Number(providerProduct.prices?.retail?.amount);
    const wholesaleEur = Number(providerProduct.prices?.wholesale?.amount);
    if (!providerCountry || !providerOperator || !Number.isFinite(providerAmount) || providerAmount <= 0 ||
        !/^[A-Z]{3}$/.test(providerCurrency) || !Number.isFinite(retailEur) || retailEur <= 0 ||
        !Number.isFinite(wholesaleEur) || wholesaleEur <= 0 || retailEur < wholesaleEur) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        refreshed: false, error: 'DT One returned invalid product identity or EUR prices. No catalog values were changed.',
        productId,
      });
    }
    if (providerCurrency !== countryCurrency(providerCountry)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ refreshed: false, error: 'DT One product currency does not match the supported country currency. No values were changed.', productId });
    }
    // DT One labels this Afghanistan operator "ATOMA Afghanistan", while
    // the existing catalog uses the canonical short label "ATOMA". Allow only
    // this explicit, country-scoped alias; never strip arbitrary country/network
    // suffixes, which could conceal a genuine operator mismatch.
    const operatorAliases = Object.freeze({
      AF: Object.freeze({ 'ATOMA AFGHANISTAN': 'ATOMA' }),
    });
    const canonicalOperator = (country, operator) => {
      const label = String(operator || '').trim().replace(/\\s+/g, ' ').toUpperCase();
      return operatorAliases[country]?.[label] || label;
    };
    const sameIdentity = String(current.country).toUpperCase() === providerCountry &&
      canonicalOperator(String(current.country).toUpperCase(), current.operator) ===
        canonicalOperator(providerCountry, providerOperator) &&
      Number(current.amount) === providerAmount &&
      String(current.currency).toUpperCase() === providerCurrency;
    if (!sameIdentity) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        refreshed: false, identityMismatch: true,
        error: 'DT One product identity differs from the catalog record. Manual review is required; no values were changed.',
        catalogIdentity: { country: current.country, operator: current.operator, amount: Number(current.amount), currency: current.currency },
        providerIdentity: { country: providerCountry, operator: providerOperator, amount: providerAmount, currency: providerCurrency },
      });
    }

    const retailCents = Math.round(retailEur * 100);
    const wholesaleCents = Math.round(wholesaleEur * 100);
    if (retailCents <= 0 || wholesaleCents <= 0 || retailCents < wholesaleCents) {
      await client.query('ROLLBACK');
      return res.status(422).json({ refreshed: false, error: 'Rounded provider EUR prices are invalid. No values were changed.', productId });
    }
    const updated = await client.query(
      `UPDATE product_catalog
       SET price_eur_cents = $1, wholesale_price_eur_cents = $2, updated_at = NOW()
       WHERE id = $3 AND active = FALSE
       RETURNING id, product_id, country, operator, amount, currency,
                 price_eur_cents, wholesale_price_eur_cents, active`,
      [retailCents, wholesaleCents, current.id]
    );
    if (updated.rowCount !== 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ refreshed: false, error: 'Catalog product changed or was activated during refresh. No values were changed.' });
    }
    await client.query('COMMIT');
    return res.json({
      refreshed: true,
      providerVerified: true,
      activationChanged: false,
      pricingSettingsChanged: false,
      transactionCreated: false,
      paymentCreated: false,
      previous: { retailPriceEurCents: Number(current.price_eur_cents), wholesalePriceEurCents: Number(current.wholesale_price_eur_cents) },
      provider: { retailPriceEurCents: retailCents, wholesalePriceEurCents: wholesaleCents },
      product: updated.rows[0],
      note: 'Only the disabled catalog product retail and wholesale prices were refreshed from verified DT One values. Review checkout pricing before activation.',
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Admin catalog price refresh failed:', error.message);
    return res.status(500).json({ refreshed: false, error: 'Could not safely refresh catalog prices.' });
  } finally {
    client.release();
  }
});

// Import one verified DT One product into the local catalog as DISABLED.
// This is an explicit admin action; it never activates products or creates transactions.
app.post('/api/admin/catalog/:productId/import', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'A valid product ID is required.' });
  }
  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    return res.status(503).json({ error: 'DT One credentials are not configured.' });
  }
  try {
    const response = await fetch(`${DTONE_API_BASE_URL}/v1/products/${productId}`, {
      method: 'GET',
      headers: { Authorization: getDtOneAuthHeader(), Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const responseText = await response.text();
    let providerProduct = null;
    try { providerProduct = responseText ? JSON.parse(responseText) : null; } catch (_) {}
    if (!response.ok || !providerProduct || Number(providerProduct.id) !== productId) {
      return res.status(response.status === 404 ? 404 : 502).json({
        imported: false, error: 'DT One could not verify this product in the configured environment.',
        productId, providerStatus: response.status,
      });
    }
    const iso = String(providerProduct.operator?.country?.iso_code || '').toUpperCase();
    const countryMap = { AFG: 'AF', PAK: 'PK', IND: 'IN', BGD: 'BD' };
    const country = countryMap[iso];
    const operator = String(providerProduct.operator?.name || '').trim();
    const currency = String(providerProduct.destination?.unit || providerProduct.benefits?.[0]?.amount?.unit || '').toUpperCase();
    const amountValue = Number(providerProduct.destination?.amount ?? providerProduct.benefits?.[0]?.amount?.base);
    const retailEur = Number(providerProduct.prices?.retail?.amount);
    const wholesaleEur = Number(providerProduct.prices?.wholesale?.amount);
    if (!country || !operator || !Number.isFinite(amountValue) || amountValue <= 0 ||
        !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(retailEur) || retailEur <= 0 ||
        !Number.isFinite(wholesaleEur) || wholesaleEur <= 0) {
      return res.status(422).json({ imported: false, error: 'Provider product is missing a supported country, denomination, currency, retail price, or wholesale price.', productId });
    }
    if (currency !== countryCurrency(country)) {
      return res.status(422).json({ imported: false, error: 'Product currency does not match the configured currency for this country.', productId, country, currency });
    }
    const retailCents = Math.round(retailEur * 100);
    const wholesaleCents = Math.round(wholesaleEur * 100);
    if (retailCents <= 0 || wholesaleCents <= 0) {
      return res.status(422).json({ imported: false, error: 'Provider EUR prices are invalid.', productId });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existingId = await client.query(
        'SELECT id, product_id, country, operator, amount, currency, active FROM product_catalog WHERE product_id = $1 FOR UPDATE',
        [productId]
      );
      if (existingId.rowCount === 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ imported: false, alreadyRegistered: true, error: 'This DT One product ID is already registered. No database values were changed.', product: existingId.rows[0] });
      }
      const existingDenomination = await client.query(
        'SELECT id, product_id, country, operator, amount, currency, active FROM product_catalog WHERE country = $1 AND LOWER(operator) = LOWER($2) AND amount = $3 AND currency = $4 FOR UPDATE',
        [country, operator, amountValue, currency]
      );
      if (existingDenomination.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ imported: false, conflict: true, error: 'A product with this network and denomination already exists under another product ID. Manual review is required; no data was changed.', existingProduct: existingDenomination.rows[0], proposedProductId: productId });
      }
      const inserted = await client.query(
        `INSERT INTO product_catalog
          (country, operator, amount, currency, product_id, price_eur_cents,
           wholesale_price_eur_cents, bonus_amount, active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, FALSE, NOW())
         RETURNING id, country, operator, amount, currency, product_id,
                   price_eur_cents, wholesale_price_eur_cents, active`,
        [country, operator, amountValue, currency, productId, retailCents, wholesaleCents]
      );
      await client.query('COMMIT');
      return res.status(201).json({
        imported: true, readOnlyProviderLookup: true, transactionCreated: false, activationChanged: false,
        product: inserted.rows[0],
        note: 'Product was added to the local catalog as disabled. Verify pricing and test the full flow before any manual activation.',
      });
    } catch (dbError) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw dbError;
    } finally { client.release(); }
  } catch (error) {
    console.error('Admin catalog product import failed:', error.message);
    return res.status(500).json({ imported: false, error: 'Could not import the verified product into the local catalog.' });
  }
});


// Read-only product discovery in the configured DT One environment.
// Used to find the correct pre-production product ID; never creates transactions.
app.get('/api/admin/dtone/operators', requireAdmin, async (req, res) => {
  if (!DTONE_API_KEY || !DTONE_API_SECRET) return res.status(503).json({ error: 'DT One credentials are not configured.' });
  const countryIsoCode = String(req.query.country_iso_code || 'AFG').toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryIsoCode)) return res.status(400).json({ error: 'country_iso_code must be a three-letter ISO code.' });
  try {
    const byId = new Map();
    let pagesChecked = 0;
    let totalSeen = 0;
    for (let page = 1; page <= 5; page += 1) {
      const url = new URL(`${DTONE_API_BASE_URL}/v1/operators`);
      url.searchParams.set('country_iso_code', countryIsoCode);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));
      const response = await fetch(url, { method: 'GET', headers: { Authorization: getDtOneAuthHeader(), Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const responseText = await response.text();
      let data = null;
      try { data = responseText ? JSON.parse(responseText) : null; } catch (_) { data = null; }
      if (!response.ok) return res.status(502).json({ verified: false, providerStatus: response.status, configuredBaseUrl: DTONE_API_BASE_URL, providerMessage: String(responseText || '').slice(0, 1000) || null, pagesChecked, error: 'DT One operator discovery failed.' });
      const operators = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      pagesChecked += 1;
      totalSeen += operators.length;
      for (const operator of operators) {
        const country = String(operator?.country?.iso_code || '').toUpperCase();
        if (country !== countryIsoCode || operator?.id == null || !operator?.name) continue;
        byId.set(String(operator.id), { id: operator.id, name: operator.name, countryIsoCode: country, regions: Array.isArray(operator.regions) ? operator.regions.map(region => region?.name).filter(Boolean) : [] });
      }
      if (operators.length < 100) break;
    }
    const operators = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ verified: true, environment: /preprod/i.test(DTONE_API_BASE_URL) ? 'pre-production' : 'configured', countryIsoCode, pagesChecked, providerOperatorsSeen: totalSeen, operatorCount: operators.length, operators, catalogActivation: 'unchanged', transactionCreated: false, note: 'Read-only operator list; network presence does not prove airtime product availability.' });
  } catch (error) {
    console.error('DT One operator discovery failed:', error.message);
    return res.status(502).json({ verified: false, error: 'Could not reach DT One operator discovery endpoint.' });
  }
});

app.get('/api/admin/dtone/products', requireAdmin, async (req, res) => {
  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    return res.status(503).json({ error: 'DT One credentials are not configured.' });
  }

  const countryIsoCode = String(req.query.country_iso_code || 'AFG').toUpperCase();
  const operatorQuery = String(req.query.operator || '').trim().toUpperCase();
  const amountQuery = req.query.amount == null || String(req.query.amount).trim() === ''
    ? null
    : Number(req.query.amount);
  if (!/^[A-Z]{3}$/.test(countryIsoCode)) {
    return res.status(400).json({ error: 'country_iso_code must be a three-letter ISO code.' });
  }
  if (amountQuery !== null && (!Number.isFinite(amountQuery) || amountQuery <= 0)) {
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }

  try {
    const matchesById = new Map();
    let providerPagesChecked = 0;
    let totalSeen = 0;

    // Check a bounded number of pages to avoid unbounded provider requests.
    for (let page = 1; page <= 20; page += 1) {
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
        signal: AbortSignal.timeout(45000),
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
        const mentionsAmount = amountQuery === null
          || benefitAmounts.includes(amountQuery)
          || productAmounts.includes(amountQuery)
          || new RegExp(`\\b${amountQuery}\\s*AFN\\b|\\bAFN\\s*${amountQuery}\\b`, 'i').test(name);
        const operatorAliases = {
          ROSHAN: ['ROSHAN'],
          ETISALAT: ['ETISALAT'],
          AWCC: ['AWCC', 'AFGHAN WIRELESS', 'AFGHAN WIRELESS COMMUNICATION', 'AFGHAN WIRELESS COMMUNICATION COMPANY'],
          SALAAM: ['SALAAM', 'SALAM'],
          ATOMA: ['ATOMA'],
        };
        const requestedAliases = operatorAliases[operatorQuery] || [operatorQuery];
        const isRequestedOperator = !operatorQuery || requestedAliases.some((alias) => operatorName.includes(alias));
        const isLikelyRelevant = isRequestedOperator && mentionsAmount;
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
      note: 'Read-only search across up to twenty pages (maximum 2,000 provider records). With no operator filter, all Afghanistan products returned by those pages are included. Results are candidates; confirm operator, denomination, and pre-production availability before mapping. No product is activated and no transaction is created.',
    });
  } catch (error) {
    const errorName = String(error?.name || 'Error').slice(0, 80);
    const errorCode = String(error?.cause?.code || error?.code || '').slice(0, 80);
    const isTimeout = errorName === 'TimeoutError' || errorName === 'AbortError' || errorCode === 'UND_ERR_CONNECT_TIMEOUT';
    console.error('DT One product discovery transport error', JSON.stringify({
      name: errorName,
      code: errorCode || null,
      message: String(error?.message || 'Unknown error').slice(0, 240),
      baseUrl: DTONE_API_BASE_URL,
    }));
    return res.status(502).json({
      verified: false,
      error: isTimeout
        ? 'DT One request timed out. Check DT One pre-production availability and Render outbound connectivity.'
        : 'Could not reach DT One product discovery endpoint.',
      diagnostic: {
        type: isTimeout ? 'timeout' : 'connection_or_request_error',
        errorName,
        errorCode: errorCode || null,
        configuredEnvironment: /preprod/i.test(DTONE_API_BASE_URL) ? 'pre-production' : 'configured',
      },
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
    let priceCalculationValid = false;
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
        priceCalculationValid = Number.isSafeInteger(preview.finalPriceCents) &&
          preview.finalPriceCents > 0 &&
          Number.isSafeInteger(preview.basePriceCents) &&
          preview.basePriceCents > 0;
        const catalogRetailPriceCents = Number(product.price_eur_cents);
        customerPricePreview = {
          currency: 'EUR',
          estimatedCustomerPriceEur: Number((preview.finalPriceCents / 100).toFixed(2)),
          estimatedCustomerPriceCents: preview.finalPriceCents,
          catalogRetailPriceEur: Number((catalogRetailPriceCents / 100).toFixed(2)),
          calculatedPriceMinusCatalogRetailEur: Number(((preview.finalPriceCents - catalogRetailPriceCents) / 100).toFixed(2)),
          catalogRetailPriceMatchesCalculatedPrice: Number.isSafeInteger(catalogRetailPriceCents) && catalogRetailPriceCents === preview.finalPriceCents,
          wholesaleCostEur: Number((preview.basePriceCents / 100).toFixed(2)),
          appFeeEur: Number((preview.feeCents / 100).toFixed(2)),
          estimatedStripeFeeEur: Number((preview.estimatedStripeFeeCents / 100).toFixed(2)),
          note: 'Checkout price is calculated from verified wholesale cost + app fee + estimated Stripe fees. catalogRetailPriceEur is a separate catalog value; any difference must be reviewed before product activation. Preview only; no payment is performed.',
        };
      } catch (previewError) {
        customerPricePreview = { error: 'Could not calculate customer price preview from the saved settings.' };
      }
    }
    const readiness = {
      wholesalePriceConfigured: product.wholesale_price_eur_cents != null &&
        Number.isSafeInteger(Number(product.wholesale_price_eur_cents)) &&
        Number(product.wholesale_price_eur_cents) > 0,
      pricingSettingsConfigured: pricing !== null && pricing.active === true,
      productEnabled: product.active === true,
      stripeConfigured: Boolean(stripe),
      stripeWebhookConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
      dtoneConfigured: Boolean(DTONE_API_KEY && DTONE_API_SECRET),
      paymentAndFulfillmentEnvironmentsCompatible: arePaymentAndFulfillmentEnvironmentsCompatible(),
      priceCalculationValid,
    };
    readiness.safeForRealCheckout = Object.values(readiness).every(Boolean);
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
      checks: readiness,
      note: 'Read-only readiness diagnostics only. A true result does not guarantee provider acceptance, actual Stripe fees, legal readiness, or successful fulfillment. No product, order, payment, or setting was changed.'
    });
  } catch (error) {
    console.error('Admin catalog pricing verification failed:', error.message);
    return res.status(500).json({ error: 'Could not verify catalog pricing.' });
  }
});

// Admin pricing overview.
// Prices and fees are returned in EUR cents.
// Known operators are seeded for convenience, then augmented from the real
// local catalog so new networks in any supported country appear automatically.
const SUPPORTED_OPERATOR_PRICING = {
  AF: ['AWCC', 'Roshan', 'Etisalat', 'Salaam', 'ATOMA'],
  PK: ['Jazz', 'Zong', 'Telenor', 'Ufone'],
  IN: ['Airtel', 'Jio', 'Vi', 'BSNL'],
  BD: ['Grameenphone', 'Robi', 'Banglalink', 'Teletalk'],
};

app.get('/api/admin/operator-pricing', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const country = normalizeCountry(req.query.country || 'AF');
  if (!isValidCountry(country)) return res.status(400).json({ error: 'Unsupported country.' });
  try {
    const [savedResult, catalogResult] = await Promise.all([
      pool.query(`SELECT country, operator, fee_eur_cents, fee_percent, active, updated_at
        FROM operator_pricing_settings WHERE country = $1 ORDER BY operator`, [country]),
      pool.query(`SELECT DISTINCT operator FROM product_catalog
        WHERE country = $1 AND operator IS NOT NULL AND BTRIM(operator) <> ''
        ORDER BY operator`, [country]),
    ]);
    const saved = new Map(savedResult.rows.map(row => [String(row.operator).toLowerCase(), row]));
    const names = new Map();
    for (const operator of SUPPORTED_OPERATOR_PRICING[country] || []) names.set(operator.toLowerCase(), operator);
    for (const row of catalogResult.rows) {
      const operator = String(row.operator).trim();
      if (operator) names.set(operator.toLowerCase(), operator);
    }
    for (const row of savedResult.rows) {
      const operator = String(row.operator).trim();
      if (operator) names.set(operator.toLowerCase(), operator);
    }
    const operators = [...names.values()].sort((a, b) => a.localeCompare(b)).map(operator =>
      saved.get(operator.toLowerCase()) || { country, operator, fee_eur_cents: 0, fee_percent: 0, active: false, updated_at: null });
    return res.json({ paymentCurrency: 'EUR', country, operators,
      note: 'Includes known operators and operators found in the catalog. An active operator fee replaces the country-wide app fee; otherwise country settings apply.' });
  } catch (error) {
    console.error('Admin operator pricing query failed:', error.message);
    return res.status(500).json({ error: 'Could not load operator pricing settings.' });
  }
});

app.put('/api/admin/operator-pricing/:country/:operator', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const country = normalizeCountry(req.params.country);
  const requested = String(req.params.operator || '').trim();
  if (!isValidCountry(country) || !requested || requested.length > 120) {
    return res.status(400).json({ error: 'Unsupported country or operator.' });
  }
  const body = req.body || {}, feeCents = Number(body.feeEurCents), feePercent = Number(body.feePercent);
  if (!Number.isSafeInteger(feeCents) || feeCents < 0 || feeCents > 100000) return res.status(400).json({ error: 'feeEurCents must be an integer from 0 to 100000.' });
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) return res.status(400).json({ error: 'feePercent must be between 0 and 100.' });
  if (typeof body.active !== 'boolean') return res.status(400).json({ error: 'active must be true or false.' });
  try {
    const known = await pool.query(`SELECT operator FROM product_catalog
      WHERE country = $1 AND LOWER(BTRIM(operator)) = LOWER($2) LIMIT 1`, [country, requested]);
    const seeded = (SUPPORTED_OPERATOR_PRICING[country] || []).find(name => name.toLowerCase() === requested.toLowerCase());
    const savedExisting = await pool.query(`SELECT operator FROM operator_pricing_settings
      WHERE country = $1 AND LOWER(operator) = LOWER($2) LIMIT 1`, [country, requested]);
    const operator = String(known.rows[0]?.operator || savedExisting.rows[0]?.operator || seeded || '').trim();
    if (!operator) return res.status(400).json({ error: 'This operator is not known for the selected country. Import or map a verified catalog product first.' });
    const result = await pool.query(`INSERT INTO operator_pricing_settings
      (country, operator, fee_eur_cents, fee_percent, active, updated_at) VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (country, operator) DO UPDATE SET fee_eur_cents=EXCLUDED.fee_eur_cents,
      fee_percent=EXCLUDED.fee_percent, active=EXCLUDED.active, updated_at=NOW()
      RETURNING country, operator, fee_eur_cents, fee_percent, active, updated_at`,
      [country, operator, feeCents, feePercent, body.active]);
    return res.json({ paymentCurrency: 'EUR', operatorPricing: result.rows[0],
      note: 'Applies to new quotes and checkouts only; existing transactions are unchanged.' });
  } catch (error) {
    console.error('Admin operator pricing update failed:', error.message);
    return res.status(500).json({ error: 'Could not save operator pricing settings.' });
  }
});

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
         COALESCE(local_currency_per_eur, afn_per_eur) AS local_currency_per_eur,
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
  // Accept the legacy request key for older admin clients, but store the
  // value in the country-neutral field. The value is never auto-converted.
  const localCurrencyPerEur = Number(
    body.localCurrencyPerEur ?? body.afnPerEur
  );
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

  if (!Number.isFinite(localCurrencyPerEur) || localCurrencyPerEur <= 0 || localCurrencyPerEur > 1000000) {
    return res.status(400).json({ error: 'localCurrencyPerEur must be a positive number no greater than 1000000.' });
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
         country, fee_eur_cents, local_currency_per_eur, afn_per_eur, bonus_percent,
         stripe_fee_percent, stripe_fixed_fee_cents, active, updated_at
       )
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (country)
       DO UPDATE SET
         fee_eur_cents = EXCLUDED.fee_eur_cents,
         local_currency_per_eur = EXCLUDED.local_currency_per_eur,
         afn_per_eur = EXCLUDED.afn_per_eur,
         bonus_percent = EXCLUDED.bonus_percent,
         stripe_fee_percent = EXCLUDED.stripe_fee_percent,
         stripe_fixed_fee_cents = EXCLUDED.stripe_fixed_fee_cents,
         active = EXCLUDED.active,
         updated_at = NOW()
       RETURNING country, fee_eur_cents, local_currency_per_eur,
                 afn_per_eur, bonus_percent, stripe_fee_percent,
                 stripe_fixed_fee_cents, active, updated_at`,
      [country, feeCents, localCurrencyPerEur, bonusPercent, stripeFeePercent, stripeFixedFeeCents, body.active]
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

    // If an admin supplies a known Checkout Session ID, use that exact object
    // even when the local order exists but its session ID was not persisted.
    // Never associate it unless Stripe's own order references match exactly.
    const suppliedSessionId = String(req.query.session_id || '').trim();
    if (suppliedSessionId && !order.stripe_session_id) {
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
          clientReferenceMatches: exactSession.client_reference_id === orderId,
          metadataOrderIdMatches: exactSession.metadata?.orderId === orderId,
          note: 'No local order or payment was changed.',
        });
      }
      session = exactSession;
      if (session.payment_intent && typeof session.payment_intent === 'object') {
        paymentIntent = session.payment_intent;
      } else if (typeof session.payment_intent === 'string') {
        paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      }
    }

    if (!session && order.stripe_session_id) {
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


// Read-only Stripe candidate report for an order whose exact Stripe reference
// was not found. Candidates are evidence for manual review only: this route
// NEVER links a payment, updates an order, refunds, or triggers DT One.
app.get('/api/admin/orders/:orderId/stripe-candidates', requireAdmin, async (req, res) => {
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
      return res.status(404).json({
        error: 'Local order not found. Candidate scan requires an existing order.',
        orderId,
        lookup: 'read_only',
      });
    }

    const order = result.rows[0];

    // Search locally persisted Stripe webhook events for exact order references.
    // This is read-only and can reveal a paid Checkout event even when the
    // session ID was not persisted on the order row. Never associate by amount.
    const webhookEvidenceResult = await pool.query(
      `SELECT
         event_id,
         payload->>'type' AS event_type,
         payload->>'created' AS event_created,
         payload #>> '{data,object,id}' AS stripe_object_id,
         payload #>> '{data,object,object}' AS stripe_object_type,
         payload #>> '{data,object,client_reference_id}' AS client_reference_id,
         payload #>> '{data,object,metadata,orderId}' AS metadata_order_id,
         payload #>> '{data,object,payment_status}' AS payment_status,
         payload #>> '{data,object,status}' AS object_status,
         payload #>> '{data,object,amount_total}' AS amount_total,
         payload #>> '{data,object,amount_received}' AS amount_received,
         payload #>> '{data,object,currency}' AS currency,
         payload #>> '{data,object,livemode}' AS livemode
       FROM webhook_events
       WHERE provider = 'stripe'
         AND (
           payload #>> '{data,object,client_reference_id}' = $1
           OR payload #>> '{data,object,metadata,orderId}' = $1
           OR payload #>> '{data,object,payment_intent,metadata,orderId}' = $1
         )
       ORDER BY (payload->>'created')::bigint DESC
       LIMIT 50`,
      [orderId]
    );
    const webhookEvidence = webhookEvidenceResult.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      eventCreated: row.event_created ? Number(row.event_created) : null,
      stripeObjectId: row.stripe_object_id || null,
      stripeObjectType: row.stripe_object_type || null,
      clientReferenceMatches: row.client_reference_id === orderId,
      metadataOrderIdMatches: row.metadata_order_id === orderId,
      paymentStatus: row.payment_status || null,
      objectStatus: row.object_status || null,
      amountTotal: row.amount_total === null ? null : Number(row.amount_total),
      amountReceived: row.amount_received === null ? null : Number(row.amount_received),
      currency: row.currency || null,
      livemode: row.livemode === null ? null : row.livemode === 'true',
    }));

    const createdMs = new Date(order.created_at).getTime();
    if (!Number.isFinite(createdMs)) {
      return res.status(500).json({ error: 'Order creation time is invalid.' });
    }

    // Deliberately broad enough to account for delayed customer checkout, but
    // bounded to avoid an unbounded scan. Stripe timestamps are Unix seconds.
    const windowSeconds = 24 * 60 * 60;
    const orderCreatedSeconds = Math.floor(createdMs / 1000);
    const created = {
      gte: Math.max(0, orderCreatedSeconds - windowSeconds),
      lte: orderCreatedSeconds + windowSeconds,
    };

    // Scan up to five pages per resource (500 records maximum each).
    // Return pagination flags so the report never implies the window was fully
    // scanned when Stripe reports more records than the bounded scan covered.
    async function listCandidates(listResource) {
      const data = [];
      let startingAfter;
      let hasMore = false;
      for (let page = 0; page < 5; page += 1) {
        const pageResult = await listResource.list({
          limit: 100,
          created,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        data.push(...pageResult.data);
        hasMore = pageResult.has_more;
        if (!hasMore || pageResult.data.length === 0) break;
        startingAfter = pageResult.data[pageResult.data.length - 1].id;
      }
      return { data, hasMore };
    }

    const [sessions, intents] = await Promise.all([
      listCandidates(stripe.checkout.sessions),
      listCandidates(stripe.paymentIntents),
    ]);

    const allSessionCandidates = sessions.data
      .filter((item) => item.currency === 'eur')
      .map((item) => ({
        id: item.id,
        created: item.created,
        amountTotal: item.amount_total ?? null,
        currency: item.currency || null,
        status: item.status || null,
        paymentStatus: item.payment_status || null,
        livemode: item.livemode,
        clientReferenceMatches: item.client_reference_id === orderId,
        metadataOrderIdMatches: item.metadata?.orderId === orderId,
        exactOrderReference: item.client_reference_id === orderId || item.metadata?.orderId === orderId,
      }));

    const allIntentCandidates = intents.data
      .filter((item) => item.currency === 'eur')
      .map((item) => ({
        id: item.id,
        created: item.created,
        amount: item.amount,
        amountReceived: item.amount_received,
        currency: item.currency || null,
        status: item.status || null,
        livemode: item.livemode,
        metadataOrderIdMatches: item.metadata?.orderId === orderId,
        exactOrderReference: item.metadata?.orderId === orderId,
      }));

    const sessionCandidates = allSessionCandidates.slice(0, 30);
    const intentCandidates = allIntentCandidates.slice(0, 30);

    return res.status(200).json({
      lookup: 'read_only_candidate_report',
      order: {
        orderId: order.order_id,
        status: order.status,
        chargeCents: Number(order.charge_cents),
        paymentCurrency: 'EUR',
        topupCurrency: order.currency,
        createdAt: order.created_at,
        savedCheckoutSessionId: order.stripe_session_id || null,
        savedPaymentIntentId: order.stripe_payment_intent_id || null,
      },
      persistedStripeWebhookEvidence: {
        count: webhookEvidence.length,
        events: webhookEvidence,
        note: 'Evidence comes from webhook events already stored locally; absence here does not prove that Stripe never collected a payment.',
      },
      searchWindow: {
        from: new Date(created.gte * 1000).toISOString(),
        to: new Date(created.lte * 1000).toISOString(),
        hoursEachSide: 24,
      },
      checkoutSessions: {
        scannedRecords: sessions.data.length,
        totalEurCandidatesFound: allSessionCandidates.length,
        returned: sessionCandidates.length,
        candidatesTruncated: allSessionCandidates.length > sessionCandidates.length,
        hasMoreInWindow: sessions.hasMore,
        candidates: sessionCandidates,
      },
      paymentIntents: {
        scannedRecords: intents.data.length,
        totalEurCandidatesFound: allIntentCandidates.length,
        returned: intentCandidates.length,
        candidatesTruncated: allIntentCandidates.length > intentCandidates.length,
        hasMoreInWindow: intents.hasMore,
        candidates: intentCandidates,
      },
      safety: {
        automaticAssociation: false,
        databaseModified: false,
        refundCreated: false,
        dtOneCalled: false,
        note: 'Candidates are not proof of payment ownership. Do not associate any candidate unless Stripe order references or event evidence establish an exact match.',
      },
    });
  } catch (error) {
    console.error('Admin Stripe candidate report failed:', error.message);
    return res.status(502).json({
      error: 'Could not build the read-only Stripe candidate report.',
      lookup: 'read_only_candidate_report',
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
         archived_at,
         archived_reason,
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
       WHERE archived_at IS NULL
         AND (status = 'topup_review'
          OR (
            status = 'processing_topup'
            AND updated_at < NOW() - INTERVAL '5 minutes'
          )
          OR (
            status = 'topup_submitted'
            AND updated_at < NOW() - INTERVAL '15 minutes'
          ))
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


// Archive only a declined ATOMA sandbox order after an admin explicitly confirms
// that Stripe Dashboard was checked and no payment was collected. Never deletes
// the order, changes its financial status, issues a refund, or calls DT One.
app.post('/api/admin/orders/:orderId/archive-declined-sandbox', requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const orderId = String(req.params.orderId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }
  if (req.body?.confirmNoStripePayment !== true) {
    return res.status(400).json({ error: 'Explicit confirmation that Stripe Dashboard was checked and no payment was collected is required.' });
  }
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (reason.length < 12) {
    return res.status(400).json({ error: 'Provide a review note explaining how payment absence and DT One decline were verified.' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT order_id, operator, status, charge_cents, stripe_session_id,
              stripe_payment_intent_id, dtone_status, archived_at
         FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (found.rowCount !== 1) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = found.rows[0];
    if (order.archived_at) {
      await client.query('COMMIT');
      return res.json({ archived: true, alreadyArchived: true, orderId, financialStatusChanged: false, deleted: false });
    }
    if (order.operator !== 'ATOMA-SANDBOX-TEST' || order.status !== 'topup_review' || String(order.dtone_status || '').toUpperCase() !== 'DECLINED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only ATOMA sandbox orders in topup_review with DT One DECLINED can be archived.' });
    }
    if (order.stripe_session_id || order.stripe_payment_intent_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Stripe identifiers are present. Resolve payment evidence first; this order cannot be archived by this endpoint.' });
    }
    await client.query(
      `UPDATE orders
          SET archived_at = NOW(), archived_reason = $2, updated_at = NOW()
        WHERE order_id = $1 AND archived_at IS NULL`,
      [orderId, reason]
    );
    await client.query('COMMIT');
    return res.json({ archived: true, orderId, financialStatusChanged: false, deleted: false, refundCreated: false, dtOneCalled: false, note: 'Order history is retained. Admin confirmation of no Stripe payment and DT One DECLINED was recorded.' });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    console.error('Sandbox order archive failed:', error.message);
    return res.status(500).json({ error: 'Could not archive sandbox order. Confirm the archive migration is applied.' });
  } finally {
    if (client) client.release();
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
  let client = null;
  let transactionOpen = false;

  try {
    // Acquire the connection inside the guarded block so pool exhaustion or
    // connection failures become a controlled API response, not an unhandled
    // rejected async route in Express 4.
    client = await pool.connect();

    // Lock and validate the order, then commit the unique refund reservation
    // before the external Stripe call. The reservation blocks a concurrent
    // refund request even after this transaction releases the order lock.
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
      paymentIntent.metadata?.orderId !== orderId ||
      paymentIntent.status !== 'succeeded' ||
      paymentIntent.currency !== 'eur' ||
      paymentIntent.amount_received !== Number(order.charge_cents) ||
      paymentIntent.livemode !== !stripeIsTest
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

    // Persist the unique reservation BEFORE calling Stripe. If Stripe succeeds
    // but a later database write fails, the reservation survives and blocks a
    // blind second refund attempt until reconciliation.
    await client.query('COMMIT');
    transactionOpen = false;

    const outcome = await executeReservedRefund({
      client, stripe, order, orderId, reason,
    });
    if (outcome.kind === 'needs_review') {
      return res.status(502).json({
        error: 'Stripe refund outcome is not confirmed. Check Stripe Dashboard before any retry.',
      });
    }
    const responseStatus = outcome.kind === 'pending' ? 202 : 200;
    return res.status(responseStatus).json({
      orderId, refundId: outcome.refund.id, status: outcome.refund.status,
      amountCents: outcome.refund.amount, currency: outcome.refund.currency,
    });
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Admin refund processing failed:', error.message);
    return res.status(500).json({ error: 'Refund processing failed; reconcile Stripe Dashboard before retrying.' });
  } finally {
    if (client) client.release();
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
      `SELECT o.order_id, o.country, o.currency, o.charge_cents, o.status,
              o.created_at, o.updated_at, o.order_access_token_hash,
              (SELECT r.status FROM refunds r WHERE r.order_id = o.order_id LIMIT 1) AS refund_status
       FROM orders o WHERE o.order_id = $1 LIMIT 1`,
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
      refundStatus: order.refund_status || null,
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