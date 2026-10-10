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

const DTONE_API_BASE_URL = (
  process.env.DTONE_API_BASE_URL ||
  'https://preprod-api.dtone.com'
).replace(/\/+$/, '');

const DTONE_CALLBACK_URL =
  process.env.DTONE_CALLBACK_URL ||
  `${APP_BASE_URL}/api/dtone/callback`;

// Admin API configuration
const ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || '';

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
const allowedOrigins = (
  process.env.CORS_ORIGIN || ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
  };
}
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

  const bonusPercent = Number(
    settings.bonus_percent
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

  return {
    country: code,
    currency: 'EUR',
    feeCents,
    afnPerEur,
    bonusPercent,
  };
}

// Read an enabled product from the database.
// Expected database table: product_catalog
async function getProduct(client, productId, requestedCountry = null, operator = null, amount = null) {
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

  if (product.enabled !== true) {
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
  };
}

// Calculate the final customer price.
// The price and fee are both in EUR cents.
function calculateFinalPrice(product, pricing) {
  const basePriceCents = requirePositiveInteger(
    product.priceCents,
    'base price'
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

  const finalPriceCents =
    basePriceCents + feeCents;

  if (!Number.isSafeInteger(finalPriceCents)) {
    throw new Error(
      'Final price is outside the supported range.'
    );
  }

  // Bonus is informational until its business rules
  // and the operator's supported delivery amount
  // have been confirmed.
  return {
    currency: 'EUR',
    basePriceCents,
    feeCents,
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
      feeCents: price.feeCents,
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
    const product = await getProduct(client, null, country, operator, amount);
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

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const product = await getProduct(
      client,
      input.productId,
      input.country,
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

    orderId = createOrderId();

    // Record the server-calculated price.
    await client.query(
      `INSERT INTO orders (
         order_id, country, operator, phone, product_id,
         amount, currency, product_price_cents, fee_cents,
         charge_cents, status, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         'awaiting_payment', NOW(), NOW()
       )`,
      [
        orderId, input.country, product.name, input.phone,
        product.id, product.localAmount, product.currency,
        price.basePriceCents, price.feeCents, price.finalPriceCents,
      ]
    );

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
      checkoutUrl: session.url,
      paymentCurrency: 'EUR',
      amountCents: price.finalPriceCents,
      amountFormatted: formatEuro(
        price.finalPriceCents
      ),
    });
  } catch (error) {
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

    try {
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

      // Stripe can retry after a server error.
      // Database processing must be idempotent.
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
  '/v2/async/transactions';

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

  if (
    !session ||
    session.payment_status !== 'paid' ||
    session.currency !== 'eur' ||
    !Number.isSafeInteger(session.amount_total) ||
    !session.id
  ) {
    throw new Error('Invalid or unpaid Stripe session.');
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

  // Re-read trusted product information from the database.
  const product = await pool.query(
    `SELECT product_id AS dtone_product_id, country, currency
     FROM product_catalog
     WHERE id = $1 AND active = TRUE
     LIMIT 1`,
    [order.product_id]
  );

  if (
    product.rowCount !== 1 ||
    product.rows[0].country !== order.country ||
    product.rows[0].currency !==
      countryCurrency(order.country)
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
        product_id: product.rows[0].dtone_product_id,
        account_number: phone,
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

// Configure the exact callback authentication mechanism
// supported by your DT One account before enabling this route.
const DTONE_CALLBACK_SECRET =
  process.env.DTONE_CALLBACK_SECRET || '';

// Normalize only recognized provider status values.
// Confirm the exact values used by your DT One API.
function normalizeDtOneStatus(value) {
  const status = String(value || '')
    .trim()
    .toLowerCase();

  if (['completed', 'successful', 'succeeded'].includes(status)) {
    return 'completed';
  }

  if (['failed', 'rejected', 'cancelled'].includes(status)) {
    return 'failed';
  }

  if (['pending', 'processing', 'accepted'].includes(status)) {
    return 'pending';
  }

  return 'unknown';
}

// Callback authentication is deliberately fail-closed.
// Replace this adapter with the authentication method
// documented for your DT One account.
function verifyDtOneCallback(req) {
  if (!DTONE_CALLBACK_SECRET) {
    return false;
  }

  const supplied = String(
    req.headers['x-pgnt-callback-secret'] || ''
  );

  const expectedBuffer = Buffer.from(
    DTONE_CALLBACK_SECRET
  );

  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(
      expectedBuffer,
      suppliedBuffer
    )
  );
}

// DT One transaction callback.
// Do not expose this route until the callback
// authentication adapter matches DT One's real protocol.
app.post('/api/dtone/callback', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Database is not configured.',
    });
  }

  if (!verifyDtOneCallback(req)) {
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

      return res.status(404).json({
        error: 'Order not found.',
      });
    }

    const order = result.rows[0];

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

      return res.status(409).json({
        error: 'Order is not awaiting DT One status.',
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

      return res.status(409).json({
        error: 'Transaction reference mismatch.',
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
      nextStatus = 'topup_submitted';
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
        String(body.status || ''),
        JSON.stringify(body),
        providerStatus,
        orderId,
      ]
    );

    await client.query('COMMIT');

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

  await pool.query(
    `UPDATE orders
     SET status = 'payment_failed',
         updated_at = NOW()
     WHERE stripe_session_id = $1
       AND status = 'awaiting_payment'`,
    [session.id]
  );
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
    } else {
      console.warn(
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
         active
       FROM pricing_settings
       ORDER BY country`
    );

    return res.json({
      paymentCurrency: 'EUR',
      pricing: result.rows,
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

  if (typeof body.active !== 'boolean') {
    return res.status(400).json({
      error: 'active must be true or false.',
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO pricing_settings (
         country, fee_eur_cents, afn_per_eur, bonus_percent, active, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (country)
       DO UPDATE SET
         fee_eur_cents = EXCLUDED.fee_eur_cents,
         afn_per_eur = EXCLUDED.afn_per_eur,
         bonus_percent = EXCLUDED.bonus_percent,
         active = EXCLUDED.active,
         updated_at = NOW()
       RETURNING country, fee_eur_cents, afn_per_eur, bonus_percent, active, updated_at`,
      [country, feeCents, afnPerEur, bonusPercent, body.active]
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

// List orders requiring operator review. Admin-only.
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
         updated_at
       FROM orders
       WHERE status = 'topup_review'
       ORDER BY updated_at ASC
       LIMIT 100`
    );

    return res.json({
      count: result.rowCount,
      orders: result.rows,
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
    return res.status(503).json({
      error: 'Payment service is not configured.',
    });
  }

  const orderId = String(req.params.orderId || '').trim();

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return res.status(400).json({
      error: 'Invalid order ID.',
    });
  }

  const reason = String(req.body?.reason || 'Top-up failed; admin reviewed')
    .trim()
    .slice(0, 500);

  const client = await pool.connect();
  let order;
  let existingRefund;

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT order_id, status, charge_cents, stripe_payment_intent_id, dtone_status
       FROM orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found.' });
    }

    order = orderResult.rows[0];

    if (order.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Top-up is completed. Refund requires a separate manual investigation.',
      });
    }

    if (
      order.status !== 'topup_review' ||
      !['failed', 'rejected', 'cancelled'].includes(
        String(order.dtone_status || '').trim().toLowerCase()
      )
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Refund requires a final DT One failure status. Unknown or pending outcomes must be reconciled first.',
      });
    }

    if (!order.stripe_payment_intent_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'The order has no verified Stripe PaymentIntent.',
      });
    }

    const refundResult = await client.query(
      `SELECT id, stripe_refund_id, amount_cents, status
       FROM refunds
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    existingRefund = refundResult.rows[0] || null;

    if (existingRefund && existingRefund.status === 'succeeded') {
      await client.query('COMMIT');
      return res.json({
        orderId,
        refundId: existingRefund.stripe_refund_id,
        status: 'refunded',
        duplicate: true,
      });
    }

    if (!existingRefund) {
      await client.query(
        `INSERT INTO refunds (order_id, amount_cents, status, reason)
         VALUES ($1, $2, 'pending', $3)`,
        [orderId, Number(order.charge_cents), reason]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Refund preparation failed:', error.message);
    return res.status(500).json({ error: 'Could not prepare refund.' });
  } finally {
    client.release();
  }

  try {
    // A stable idempotency key makes a retried HTTP request safe
    // even if Stripe succeeded but the app lost the response.
    const refund = await stripe.refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: { orderId, adminReason: reason },
      },
      { idempotencyKey: `pgnt-refund-${orderId}` }
    );

    await pool.query(
      `UPDATE refunds
       SET stripe_refund_id = $1,
           amount_cents = $2,
           status = $3,
           reason = $4
       WHERE order_id = $5`,
      [
        refund.id,
        refund.amount,
        refund.status,
        reason,
        orderId,
      ]
    );

    if (refund.status === 'succeeded') {
      await pool.query(
        `UPDATE orders
         SET status = 'refunded',
             refunded_at = COALESCE(refunded_at, NOW()),
             updated_at = NOW()
         WHERE order_id = $1
           AND status <> 'completed'`,
        [orderId]
      );
    } else {
      await pool.query(
        `UPDATE orders
         SET status = 'topup_review',
             updated_at = NOW()
         WHERE order_id = $1
           AND status <> 'completed'`,
        [orderId]
      );
    }

    return res.status(200).json({
      orderId,
      refundId: refund.id,
      status: refund.status,
      amountCents: refund.amount,
      currency: refund.currency,
    });
  } catch (error) {
    console.error('Stripe refund request failed:', error.message);

    await pool.query(
      `UPDATE refunds
       SET status = 'failed',
           reason = $1
       WHERE order_id = $2
         AND status <> 'succeeded'`,
      [`Refund request failed: ${error.message.slice(0, 400)}`, orderId]
    );

    return res.status(502).json({
      error: 'Stripe refund could not be confirmed. Check Stripe Dashboard before retrying.',
    });
  }
});

// Basic order-status lookup.
// In production, protect this endpoint with customer
// authentication or a securely generated order-access token.
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
    const result = await pool.query(
      `SELECT
         order_id,
         country,
         currency,
         charge_cents,
         status,
         created_at,
         updated_at
       FROM orders
       WHERE order_id = $1
       LIMIT 1`,
      [orderId]
    );

    if (result.rowCount !== 1) {
      return res.status(404).json({
        error: 'Order not found.',
      });
    }

    const order = result.rows[0];

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

// Start the server only after configuration checks.
// Keep this block once, at the very end of server.js.
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
