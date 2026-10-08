require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const Stripe = require("stripe");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  "https://pgnt-asian-backend.onrender.com";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

const STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || "";

const ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || "";

const DTONE_API_KEY =
  process.env.DTONE_API_KEY || "";

const DTONE_API_SECRET =
  process.env.DTONE_API_SECRET || "";

const DTONE_API_BASE_URL =
  process.env.DTONE_API_BASE_URL ||
  process.env.DTONE_BASE_URL ||
  "https://preprod-api.dtone.com";

const DTONE_CALLBACK_URL =
  process.env.DTONE_CALLBACK_URL ||
  `${APP_BASE_URL}/api/dtone/callback`;

const DATABASE_URL =
  process.env.DATABASE_URL || "";

if (!STRIPE_SECRET_KEY) {
  console.warn("WARNING: STRIPE_SECRET_KEY is not configured.");
}

if (!DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL is not configured.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

function requireDatabase(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      ok: false,
      error: "Database is not configured.",
    });
  }

  next();
}

function requireStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({
      ok: false,
      error: "Stripe is not configured.",
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: "Admin API key is not configured.",
    });
  }

  const provided =
    req.headers["x-admin-api-key"] || "";

  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(ADMIN_API_KEY));

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(
      providedBuffer,
      expectedBuffer
    )
  ) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized.",
    });
  }

  next();
}

function normalizeCountry(country) {
  return String(country || "")
    .trim()
    .toUpperCase();
}

function normalizeCurrency(currency) {
  return String(currency || "")
    .trim()
    .toUpperCase();
}

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function normalizeProductId(productId) {
  const value = Number(productId);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function generateOrderId() {
  return `PGNT-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function isValidCountry(country) {
  return ["AF", "PK", "IN", "BD"].includes(country);
}

function countryCurrency(country) {
  const currencies = {
    AF: "AFN",
    PK: "PKR",
    IN: "INR",
    BD: "BDT",
  };

  return currencies[country] || null;
}

function validatePhone(country, phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  const rules = {
    AF: { min: 9, max: 10 },
    PK: { min: 10, max: 11 },
    IN: { min: 10, max: 12 },
    BD: { min: 10, max: 11 },
  };

  const rule = rules[country];

  if (!rule) {
    return false;
  }

  return (
    digits.length >= rule.min &&
    digits.length <= rule.max
  );
}
// ------------------------------------------------------------
// DT ONE HELPERS
// ------------------------------------------------------------

function getDtoneAuthHeader() {
  const token = Buffer.from(
    `${DTONE_API_KEY}:${DTONE_API_SECRET}`
  ).toString("base64");

  return `Basic ${token}`;
}

function getDtoneHeaders() {
  return {
    Authorization: getDtoneAuthHeader(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function createDtoneTransaction({
  productId,
  phone,
  country,
  orderId,
}) {
  if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    throw new Error(
      "DT One credentials are not configured."
    );
  }

  const normalizedProductId =
    normalizeProductId(productId);

  if (!normalizedProductId) {
    throw new Error("Invalid DT One product ID.");
  }

  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    throw new Error("Invalid recipient phone number.");
  }

  const url =
    `${DTONE_API_BASE_URL.replace(/\/$/, "")}` +
    `/v1/async/transactions`;

  const payload = {
    product_id: normalizedProductId,
    external_id: orderId,
    callback_url: DTONE_CALLBACK_URL,
    auto_confirm: true,
    operator: {
      country: country,
    },
    recipient: {
      phone_number: normalizedPhone,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: getDtoneHeaders(),
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = {
      raw: text,
    };
  }

  if (!response.ok) {
    const error = new Error(
      `DT One request failed with HTTP ${response.status}`
    );

    error.status = response.status;
    error.response = data;

    throw error;
  }

  return data;
}

// ------------------------------------------------------------
// DATABASE HELPERS
// ------------------------------------------------------------

async function getPricingSettings(client, country) {
  const result = await client.query(
    `
      SELECT
        country,
        currency,
        fee_eur_cents,
        bonus_percent,
        enabled
      FROM pricing_settings
      WHERE country = $1
      LIMIT 1
    `,
    [country]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function getProduct(client, productId) {
  const result = await client.query(
    `
      SELECT
        id,
        country,
        currency,
        dtone_product_id,
        name,
        description,
        local_amount,
        price_eur_cents,
        bonus_percent,
        enabled
      FROM product_catalog
      WHERE id = $1
      LIMIT 1
    `,
    [productId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function getOrderById(client, orderId) {
  const result = await client.query(
    `
      SELECT *
      FROM orders
      WHERE order_id = $1
      LIMIT 1
    `,
    [orderId]
  );

  return result.rows[0] || null;
}

async function getOrderForUpdate(client, orderId) {
  const result = await client.query(
    `
      SELECT *
      FROM orders
      WHERE order_id = $1
      FOR UPDATE
    `,
    [orderId]
  );

  return result.rows[0] || null;
}

async function updateOrderStatus(
  client,
  orderId,
  status,
  extra = {}
) {
  const fields = ["status = $2"];
  const values = [orderId, status];
  let index = 3;

  for (const [key, value] of Object.entries(extra)) {
    fields.push(`${key} = $${index}`);
    values.push(value);
    index++;
  }

  await client.query(
    `
      UPDATE orders
      SET
        ${fields.join(", ")},
        updated_at = NOW()
      WHERE order_id = $1
    `,
    values
  );
}
// ------------------------------------------------------------
// ORDER VALIDATION & PRICING
// ------------------------------------------------------------

function calculateFinalPrice(product, pricing) {
  const basePrice = Number(product.price_eur_cents || 0);

  const fee = Number(pricing.fee_eur_cents || 0);

  const productBonus =
    product.bonus_percent !== null &&
    product.bonus_percent !== undefined
      ? Number(product.bonus_percent)
      : Number(pricing.bonus_percent || 0);

  const bonusAmount = Math.round(
    basePrice * (productBonus / 100)
  );

  const finalPrice = basePrice + fee;

  return {
    basePriceCents: basePrice,
    feeCents: fee,
    bonusPercent: productBonus,
    bonusAmountCents: bonusAmount,
    finalPriceCents: finalPrice,
  };
}

function validateCheckoutInput(body) {
  const country = normalizeCountry(body.country);
  const currency = normalizeCurrency(body.currency);
  const phone = normalizePhone(body.phone);
  const productId = normalizeProductId(body.productId);

  if (!isValidCountry(country)) {
    return {
      ok: false,
      error: "Unsupported country.",
    };
  }

  const expectedCurrency = countryCurrency(country);

  if (currency && currency !== expectedCurrency) {
    return {
      ok: false,
      error: "Currency does not match country.",
    };
  }

  if (!phone || !validatePhone(country, phone)) {
    return {
      ok: false,
      error: "Invalid recipient phone number.",
    };
  }

  if (!productId) {
    return {
      ok: false,
      error: "Invalid product.",
    };
  }

  return {
    ok: true,
    country,
    currency: expectedCurrency,
    phone,
    productId,
  };
}

// ------------------------------------------------------------
// DT ONE FULFILLMENT
// ------------------------------------------------------------

async function fulfillPaidOrder(orderId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const order = await getOrderForUpdate(
      client,
      orderId
    );

    if (!order) {
      await client.query("ROLLBACK");

      throw new Error(
        `Order ${orderId} was not found.`
      );
    }

    if (order.status === "completed") {
      await client.query("COMMIT");

      return {
        ok: true,
        status: "completed",
        alreadyCompleted: true,
      };
    }

    if (
      order.status === "processing" ||
      order.status === "pending_dtone"
    ) {
      await client.query("COMMIT");

      return {
        ok: true,
        status: order.status,
        alreadyProcessing: true,
      };
    }

    if (order.payment_status !== "paid") {
      await client.query("ROLLBACK");

      throw new Error(
        "Order cannot be fulfilled before payment is verified."
      );
    }

    await updateOrderStatus(
      client,
      orderId,
      "processing"
    );

    await client.query("COMMIT");

    const dtoneResult =
      await createDtoneTransaction({
        productId: order.dtone_product_id,
        phone: order.phone,
        country: order.country,
        orderId: order.order_id,
      });

    const dtoneTransactionId =
      dtoneResult?.id ||
      dtoneResult?.transaction_id ||
      dtoneResult?.transaction?.id ||
      null;

    const status =
      String(
        dtoneResult?.status ||
        dtoneResult?.transaction?.status ||
        "pending"
      ).toLowerCase();

    const finalStatus =
      [
        "completed",
        "successful",
        "success",
      ].includes(status)
        ? "completed"
        : [
            "failed",
            "failure",
            "rejected",
          ].includes(status)
        ? "failed"
        : "pending_dtone";

    await pool.query(
      `
        UPDATE orders
        SET
          status = $2,
          dtone_transaction_id = $3,
          dtone_status = $4,
          dtone_response = $5::jsonb,
          updated_at = NOW()
        WHERE order_id = $1
      `,
      [
        orderId,
        finalStatus,
        dtoneTransactionId,
        status,
        JSON.stringify(dtoneResult || {}),
      ]
    );

    return {
      ok: true,
      status: finalStatus,
      dtoneTransactionId,
      dtoneStatus: status,
      dtoneResponse: dtoneResult,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    await pool.query(
      `
        UPDATE orders
        SET
          status = 'review',
          last_error = $2,
          updated_at = NOW()
        WHERE order_id = $1
          AND status = 'processing'
      `,
      [
        orderId,
        String(error.message || error),
      ]
    );

    throw error;
  } finally {
    client.release();
  }
    }
// ------------------------------------------------------------
// STRIPE PAYMENT PROCESSING
// ------------------------------------------------------------

async function processPaidStripeSession(session) {
  if (!session || !session.id) {
    throw new Error("Invalid Stripe Checkout Session.");
  }

  const orderId =
    session.metadata?.orderId || null;

  if (!orderId) {
    throw new Error(
      "Stripe session does not contain orderId."
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const order = await getOrderForUpdate(
      client,
      orderId
    );

    if (!order) {
      await client.query("ROLLBACK");

      throw new Error(
        `Order ${orderId} was not found.`
      );
    }

    // Prevent duplicate webhook processing.
    if (order.payment_status === "paid") {
      await client.query("COMMIT");

      return {
        ok: true,
        alreadyPaid: true,
        orderId,
        status: order.status,
      };
    }

    // Stripe must confirm the payment.
    if (session.payment_status !== "paid") {
      await client.query("ROLLBACK");

      return {
        ok: false,
        paid: false,
        orderId,
        paymentStatus:
          session.payment_status || "unknown",
      };
    }

    const stripeAmount =
      Number(session.amount_total || 0);

    // Never trust the amount sent by Flutter.
    // Compare Stripe's final amount with our database price.
    if (
      stripeAmount !==
      Number(order.final_price_eur_cents)
    ) {
      await client.query("ROLLBACK");

      throw new Error(
        `Stripe amount mismatch for order ${orderId}.`
      );
    }

    await client.query(
      `
        UPDATE orders
        SET
          payment_status = 'paid',
          stripe_session_id = $2,
          stripe_payment_intent_id = $3,
          paid_at = NOW(),
          updated_at = NOW()
        WHERE order_id = $1
      `,
      [
        orderId,
        session.id,
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      ]
    );

    await client.query("COMMIT");

    // Fulfillment happens only AFTER
    // Stripe payment has been verified.
    return await fulfillPaidOrder(orderId);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// EXPRESS SETUP
// IMPORTANT:
// Stripe webhook MUST be registered before express.json()
// ------------------------------------------------------------

app.use(cors());

app.post(
  "/api/stripe/webhook",
  express.raw({
    type: "application/json",
  }),
  async (req, res) => {
    if (!stripe) {
      return res.status(503).send(
        "Stripe is not configured."
      );
    }

    const signature =
      req.headers["stripe-signature"];

    if (!signature) {
      return res.status(400).send(
        "Missing Stripe signature."
      );
    }

    if (!STRIPE_WEBHOOK_SECRET) {
      return res.status(503).send(
        "Stripe webhook secret is not configured."
      );
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed:",
        error.message
      );

      return res.status(400).send(
        "Invalid webhook signature."
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing =
        await client.query(
          `
            SELECT id
            FROM webhook_events
            WHERE provider = 'stripe'
              AND event_id = $1
            LIMIT 1
          `,
          [event.id]
        );

      if (existing.rows.length > 0) {
        await client.query("COMMIT");

        return res.json({
          received: true,
          duplicate: true,
        });
      }

      await client.query(
        `
          INSERT INTO webhook_events
            (provider, event_id, event_type, payload)
          VALUES
            ('stripe', $1, $2, $3::jsonb)
        `,
        [
          event.id,
          event.type,
          JSON.stringify(event),
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Stripe webhook database error:",
        error
      );

      return res.status(500).json({
        received: false,
        error: "Webhook database error.",
      });
    } finally {
      client.release();
    }

    try {
      if (
        event.type ===
        "checkout.session.completed"
      ) {
        await processPaidStripeSession(
          event.data.object
        );
      }

      return res.json({
        received: true,
      });
    } catch (error) {
      console.error(
        "Stripe webhook processing error:",
        error
      );

      // Return 200 because the webhook event itself
      // has already been recorded and should not create
      // duplicate fulfillment attempts.
      return res.json({
        received: true,
        processingError: true,
      });
    }
  }
);

app.use(express.json());
// ------------------------------------------------------------
// BASIC ROUTES
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    ok: true,
    app: "PGNT ASIAN TOPUP",
    service: "Backend API",
    status: "online",
    version: "2.0.0",
  });
});

app.get("/health", async (req, res) => {
  let database = "not_configured";

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch (error) {
      database = "error";
    }
  }

  res.json({
    ok: database === "connected",
    service: "pgnt-asian-backend",
    database,
    stripe: Boolean(stripe),
    dtone: Boolean(
      DTONE_API_KEY && DTONE_API_SECRET
    ),
    time: new Date().toISOString(),
  });
});

// ------------------------------------------------------------
// PUBLIC CATALOG
// ------------------------------------------------------------

app.get(
  "/api/catalog",
  requireDatabase,
  async (req, res) => {
    try {
      const country = normalizeCountry(
        req.query.country
      );

      const values = [];
      let where = "WHERE enabled = TRUE";

      if (country) {
        values.push(country);
        where += ` AND country = $${values.length}`;
      }

      const result = await pool.query(
        `
          SELECT
            id,
            country,
            currency,
            name,
            description,
            local_amount,
            price_eur_cents,
            bonus_percent
          FROM product_catalog
          ${where}
          ORDER BY
            country ASC,
            local_amount ASC,
            id ASC
        `,
        values
      );

      res.json({
        ok: true,
        products: result.rows,
      });
    } catch (error) {
      console.error(
        "Catalog error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Unable to load catalog.",
      });
    }
  }
);

// ------------------------------------------------------------
// CREATE STRIPE CHECKOUT
// ------------------------------------------------------------

app.post(
  "/api/payments/checkout",
  requireDatabase,
  requireStripe,
  async (req, res) => {
    const validation =
      validateCheckoutInput(req.body);

    if (!validation.ok) {
      return res.status(400).json(validation);
    }

    const {
      country,
      currency,
      phone,
      productId,
    } = validation;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const product = await getProduct(
        client,
        productId
      );

      if (!product) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          ok: false,
          error: "Product not found.",
        });
      }

      if (!product.enabled) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error: "This product is currently unavailable.",
        });
      }

      if (
        normalizeCountry(product.country) !==
        country
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error: "Product country mismatch.",
        });
      }

      if (
        normalizeCurrency(product.currency) !==
        currency
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error: "Product currency mismatch.",
        });
      }

      const pricing =
        await getPricingSettings(
          client,
          country
        );

      if (!pricing || !pricing.enabled) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error: "Pricing is not available for this country.",
        });
      }

      const price =
        calculateFinalPrice(
          product,
          pricing
        );

      const orderId =
        generateOrderId();

      await client.query(
        `
          INSERT INTO orders (
            order_id,
            country,
            currency,
            phone,
            product_id,
            dtone_product_id,
            local_amount,
            base_price_eur_cents,
            fee_eur_cents,
            bonus_percent,
            bonus_amount_eur_cents,
            final_price_eur_cents,
            payment_status,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            'pending',
            'created'
          )
        `,
        [
          orderId,
          country,
          currency,
          phone,
          product.id,
          product.dtone_product_id,
          product.local_amount,
          price.basePriceCents,
          price.feeCents,
          price.bonusPercent,
          price.bonusAmountCents,
          price.finalPriceCents,
        ]
      );

      await client.query("COMMIT");

      const session =
        await stripe.checkout.sessions.create({
          mode: "payment",

          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name:
                    `PGNT ASIAN TOPUP - ` +
                    `${country} ${product.local_amount} ${currency}`,
                  description:
                    `Top-up for ${phone}`,
                },
                unit_amount:
                  price.finalPriceCents,
              },
              quantity: 1,
            },
          ],

          metadata: {
            orderId,
            productId: String(product.id),
            country,
          },

          success_url:
            `${APP_BASE_URL}` +
            `/payment-success?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            `${APP_BASE_URL}` +
            `/payment-cancelled?order_id=${encodeURIComponent(
              orderId
            )}`,
        });

      await pool.query(
        `
          UPDATE orders
          SET
            stripe_session_id = $2,
            updated_at = NOW()
          WHERE order_id = $1
        `,
        [
          orderId,
          session.id,
        ]
      );

      return res.json({
        ok: true,
        orderId,
        checkoutSessionId:
          session.id,
        checkoutUrl:
          session.url,
        pricing: {
          basePriceCents:
            price.basePriceCents,
          feeCents:
            price.feeCents,
          bonusPercent:
            price.bonusPercent,
          bonusAmountCents:
            price.bonusAmountCents,
          finalPriceCents:
            price.finalPriceCents,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Checkout error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Unable to create checkout.",
      });
    } finally {
      client.release();
    }
  }
);
// ------------------------------------------------------------
// ORDER STATUS
// ------------------------------------------------------------

app.get(
  "/api/orders/:orderId",
  requireDatabase,
  async (req, res) => {
    try {
      const orderId =
        String(req.params.orderId || "").trim();

      if (!orderId) {
        return res.status(400).json({
          ok: false,
          error: "Order ID is required.",
        });
      }

      const result = await pool.query(
        `
          SELECT
            order_id,
            country,
            currency,
            phone,
            product_id,
            local_amount,
            base_price_eur_cents,
            fee_eur_cents,
            bonus_percent,
            bonus_amount_eur_cents,
            final_price_eur_cents,
            payment_status,
            status,
            stripe_session_id,
            stripe_payment_intent_id,
            dtone_transaction_id,
            dtone_status,
            last_error,
            created_at,
            paid_at,
            updated_at
          FROM orders
          WHERE order_id = $1
          LIMIT 1
        `,
        [orderId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Order not found.",
        });
      }

      const order = result.rows[0];

      res.json({
        ok: true,
        order: {
          orderId: order.order_id,
          country: order.country,
          currency: order.currency,
          phone: order.phone,
          productId: order.product_id,
          localAmount: order.local_amount,

          pricing: {
            basePriceCents:
              order.base_price_eur_cents,
            feeCents:
              order.fee_eur_cents,
            bonusPercent:
              order.bonus_percent,
            bonusAmountCents:
              order.bonus_amount_eur_cents,
            finalPriceCents:
              order.final_price_eur_cents,
          },

          paymentStatus:
            order.payment_status,

          status:
            order.status,

          stripeSessionId:
            order.stripe_session_id,

          stripePaymentIntentId:
            order.stripe_payment_intent_id,

          dtoneTransactionId:
            order.dtone_transaction_id,

          dtoneStatus:
            order.dtone_status,

          error:
            order.last_error,

          createdAt:
            order.created_at,

          paidAt:
            order.paid_at,

          updatedAt:
            order.updated_at,
        },
      });
    } catch (error) {
      console.error(
        "Order status error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Unable to load order.",
      });
    }
  }
);

// ------------------------------------------------------------
// DT ONE CALLBACK
// ------------------------------------------------------------

app.post(
  "/api/dtone/callback",
  requireDatabase,
  async (req, res) => {
    try {
      const body = req.body || {};

      const orderId =
        body.external_id ||
        body.externalId ||
        body.order_id ||
        body.orderId ||
        null;

      const transactionId =
        body.id ||
        body.transaction_id ||
        body.transactionId ||
        body.transaction?.id ||
        null;

      const receivedStatus =
        body.status ||
        body.transaction?.status ||
        body.result?.status ||
        null;

      if (!orderId && !transactionId) {
        return res.status(400).json({
          ok: false,
          error:
            "Missing order or transaction identifier.",
        });
      }

      let order = null;

      if (orderId) {
        const result = await pool.query(
          `
            SELECT *
            FROM orders
            WHERE order_id = $1
            LIMIT 1
          `,
          [String(orderId)]
        );

        order = result.rows[0] || null;
      }

      if (!order && transactionId) {
        const result = await pool.query(
          `
            SELECT *
            FROM orders
            WHERE dtone_transaction_id = $1
            LIMIT 1
          `,
          [String(transactionId)]
        );

        order = result.rows[0] || null;
      }

      if (!order) {
        console.warn(
          "DT One callback: order not found.",
          {
            orderId,
            transactionId,
          }
        );

        return res.status(200).json({
          ok: true,
          received: true,
          orderFound: false,
        });
      }

      const status =
        String(
          receivedStatus || "pending"
        ).toLowerCase();

      let finalOrderStatus =
        "pending_dtone";

      if (
        [
          "completed",
          "successful",
          "success",
          "succeeded",
        ].includes(status)
      ) {
        finalOrderStatus = "completed";
      }

      if (
        [
          "failed",
          "failure",
          "rejected",
          "cancelled",
          "canceled",
        ].includes(status)
      ) {
        finalOrderStatus = "failed";
      }

      await pool.query(
        `
          UPDATE orders
          SET
            status = $2,
            dtone_transaction_id =
              COALESCE($3, dtone_transaction_id),
            dtone_status = $4,
            dtone_response = $5::jsonb,
            last_error =
              CASE
                WHEN $2 = 'failed'
                THEN COALESCE($6, 'DT One top-up failed.')
                ELSE last_error
              END,
            updated_at = NOW()
          WHERE order_id = $1
        `,
        [
          order.order_id,
          finalOrderStatus,
          transactionId
            ? String(transactionId)
            : null,
          status,
          JSON.stringify(body),
          body.error ||
            body.message ||
            body.failure_reason ||
            null,
        ]
      );

      return res.status(200).json({
        ok: true,
        received: true,
        orderId: order.order_id,
        status: finalOrderStatus,
      });
    } catch (error) {
      console.error(
        "DT One callback error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "Callback processing failed.",
      });
    }
  }
);

// ------------------------------------------------------------
// 404 HANDLER
// ------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found.",
    path: req.path,
  });
});
// ------------------------------------------------------------
// ADMIN — PRICING SETTINGS
// ------------------------------------------------------------

app.get(
  "/api/admin/pricing",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          country,
          currency,
          fee_eur_cents,
          bonus_percent,
          enabled,
          updated_at
        FROM pricing_settings
        ORDER BY country ASC
      `);

      res.json({
        ok: true,
        pricing: result.rows,
      });
    } catch (error) {
      console.error(
        "Admin pricing GET error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Unable to load pricing settings.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — UPDATE COUNTRY PRICING
// ------------------------------------------------------------

app.put(
  "/api/admin/pricing/:country",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const country =
        normalizeCountry(req.params.country);

      if (!isValidCountry(country)) {
        return res.status(400).json({
          ok: false,
          error: "Unsupported country.",
        });
      }

      const currency =
        countryCurrency(country);

      const feeCents = Number(
        req.body.feeEurCents
      );

      const bonusPercent = Number(
        req.body.bonusPercent
      );

      const enabled =
        req.body.enabled === undefined
          ? true
          : Boolean(req.body.enabled);

      if (
        !Number.isInteger(feeCents) ||
        feeCents < 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "feeEurCents must be a non-negative integer.",
        });
      }

      if (
        !Number.isFinite(bonusPercent) ||
        bonusPercent < 0 ||
        bonusPercent > 100
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "bonusPercent must be between 0 and 100.",
        });
      }

      const result = await pool.query(
        `
          INSERT INTO pricing_settings (
            country,
            currency,
            fee_eur_cents,
            bonus_percent,
            enabled,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            NOW()
          )
          ON CONFLICT (country)
          DO UPDATE SET
            currency = EXCLUDED.currency,
            fee_eur_cents =
              EXCLUDED.fee_eur_cents,
            bonus_percent =
              EXCLUDED.bonus_percent,
            enabled =
              EXCLUDED.enabled,
            updated_at = NOW()
          RETURNING
            country,
            currency,
            fee_eur_cents,
            bonus_percent,
            enabled,
            updated_at
        `,
        [
          country,
          currency,
          feeCents,
          bonusPercent,
          enabled,
        ]
      );

      res.json({
        ok: true,
        pricing: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Admin pricing PUT error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to update pricing settings.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — PRODUCT LIST
// ------------------------------------------------------------

app.get(
  "/api/admin/products",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const country = normalizeCountry(
        req.query.country
      );

      const values = [];
      let where = "";

      if (country) {
        values.push(country);
        where = `WHERE country = $1`;
      }

      const result = await pool.query(
        `
          SELECT
            id,
            country,
            currency,
            dtone_product_id,
            name,
            description,
            local_amount,
            price_eur_cents,
            bonus_percent,
            enabled,
            created_at,
            updated_at
          FROM product_catalog
          ${where}
          ORDER BY
            country ASC,
            local_amount ASC,
            id ASC
        `,
        values
      );

      res.json({
        ok: true,
        products: result.rows,
      });
    } catch (error) {
      console.error(
        "Admin products GET error:",
        error
      );

      res.status(500).json({
        ok: false,
        error: "Unable to load products.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — UPDATE PRODUCT
// ------------------------------------------------------------

app.put(
  "/api/admin/products/:id",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        normalizeProductId(req.params.id);

      if (!productId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid product ID.",
        });
      }

      const updates = [];
      const values = [productId];
      let index = 2;

      if (
        req.body.priceEurCents !==
        undefined
      ) {
        const price = Number(
          req.body.priceEurCents
        );

        if (
          !Number.isInteger(price) ||
          price <= 0
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "priceEurCents must be a positive integer.",
          });
        }

        updates.push(
          `price_eur_cents = $${index}`
        );

        values.push(price);
        index++;
      }

      if (
        req.body.bonusPercent !==
        undefined
      ) {
        const bonus = Number(
          req.body.bonusPercent
        );

        if (
          !Number.isFinite(bonus) ||
          bonus < 0 ||
          bonus > 100
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "bonusPercent must be between 0 and 100.",
          });
        }

        updates.push(
          `bonus_percent = $${index}`
        );

        values.push(bonus);
        index++;
      }

      if (
        req.body.enabled !==
        undefined
      ) {
        updates.push(
          `enabled = $${index}`
        );

        values.push(
          Boolean(req.body.enabled)
        );

        index++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "No valid changes supplied.",
        });
      }

      updates.push(
        "updated_at = NOW()"
      );

      const result = await pool.query(
        `
          UPDATE product_catalog
          SET
            ${updates.join(", ")}
          WHERE id = $1
          RETURNING *
        `,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Product not found.",
        });
      }

      res.json({
        ok: true,
        product: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Admin product update error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to update product.",
      });
    }
  }
);
// ------------------------------------------------------------
// ADMIN — RETRY FAILED / REVIEW ORDER
// ------------------------------------------------------------

app.post(
  "/api/admin/orders/:orderId/retry",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    const orderId =
      String(req.params.orderId || "").trim();

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        error: "Order ID is required.",
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT
            order_id,
            payment_status,
            status
          FROM orders
          WHERE order_id = $1
          LIMIT 1
        `,
        [orderId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Order not found.",
        });
      }

      const order = result.rows[0];

      if (order.payment_status !== "paid") {
        return res.status(400).json({
          ok: false,
          error:
            "Only paid orders can be retried.",
        });
      }

      if (order.status === "completed") {
        return res.json({
          ok: true,
          message:
            "This order is already completed.",
          status: "completed",
        });
      }

      const resultRetry =
        await fulfillPaidOrder(orderId);

      return res.json({
        ok: true,
        orderId,
        result: resultRetry,
      });
    } catch (error) {
      console.error(
        "Admin retry error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Unable to retry order.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — ORDER LIST
// ------------------------------------------------------------

app.get(
  "/api/admin/orders",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const limitRaw =
        Number(req.query.limit || 50);

      const limit = Math.min(
        Math.max(
          Number.isInteger(limitRaw)
            ? limitRaw
            : 50,
          1
        ),
        200
      );

      const status =
        req.query.status
          ? String(req.query.status)
              .trim()
              .toLowerCase()
          : null;

      const values = [];
      let where = "";

      if (status) {
        values.push(status);
        where = `WHERE status = $1`;
      }

      values.push(limit);

      const result = await pool.query(
        `
          SELECT
            order_id,
            country,
            currency,
            phone,
            product_id,
            local_amount,
            final_price_eur_cents,
            payment_status,
            status,
            stripe_session_id,
            stripe_payment_intent_id,
            dtone_transaction_id,
            dtone_status,
            last_error,
            created_at,
            paid_at,
            updated_at
          FROM orders
          ${where}
          ORDER BY created_at DESC
          LIMIT $${values.length}
        `,
        values
      );

      res.json({
        ok: true,
        orders: result.rows,
      });
    } catch (error) {
      console.error(
        "Admin orders error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to load orders.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — STRIPE REFUND
// ------------------------------------------------------------

app.post(
  "/api/admin/orders/:orderId/refund",
  requireDatabase,
  requireStripe,
  requireAdmin,
  async (req, res) => {
    const orderId =
      String(req.params.orderId || "").trim();

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        error: "Order ID is required.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const order =
        await getOrderForUpdate(
          client,
          orderId
        );

      if (!order) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          ok: false,
          error: "Order not found.",
        });
      }

      if (
        order.payment_status !== "paid"
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error:
            "Only paid orders can be refunded.",
        });
      }

      if (order.refund_status === "refunded") {
        await client.query("ROLLBACK");

        return res.json({
          ok: true,
          alreadyRefunded: true,
          orderId,
        });
      }

      let paymentIntent =
        order.stripe_payment_intent_id;

      // If payment intent was not saved,
      // retrieve it from the Stripe session.
      if (
        !paymentIntent &&
        order.stripe_session_id
      ) {
        const session =
          await stripe.checkout.sessions.retrieve(
            order.stripe_session_id
          );

        if (
          typeof session.payment_intent ===
          "string"
        ) {
          paymentIntent =
            session.payment_intent;
        }
      }

      if (!paymentIntent) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error:
            "Stripe payment intent was not found.",
        });
      }

      const refund =
        await stripe.refunds.create({
          payment_intent: paymentIntent,
          metadata: {
            orderId,
            source: "PGNT_ADMIN",
          },
        });

      await client.query(
        `
          INSERT INTO refunds (
            order_id,
            stripe_refund_id,
            amount_eur_cents,
            status,
            reason
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
          )
        `,
        [
          orderId,
          refund.id,
          refund.amount || 0,
          refund.status || "pending",
          req.body.reason ||
            "Admin refund",
        ]
      );

      await client.query(
        `
          UPDATE orders
          SET
            refund_status = $2,
            status = 'refunded',
            refunded_at = NOW(),
            updated_at = NOW()
          WHERE order_id = $1
        `,
        [
          orderId,
          refund.status === "succeeded"
            ? "refunded"
            : "pending",
        ]
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        orderId,
        refundId: refund.id,
        refundStatus:
          refund.status,
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Admin refund error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Unable to refund order.",
      });
    } finally {
      client.release();
    }
  }
);
// ------------------------------------------------------------
// ADMIN — DASHBOARD SUMMARY
// ------------------------------------------------------------

app.get(
  "/api/admin/dashboard",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,

          COUNT(*) FILTER (
            WHERE status = 'completed'
          )::int AS completed_orders,

          COUNT(*) FILTER (
            WHERE status = 'failed'
          )::int AS failed_orders,

          COUNT(*) FILTER (
            WHERE status = 'pending_dtone'
          )::int AS pending_dtone_orders,

          COUNT(*) FILTER (
            WHERE status = 'review'
          )::int AS review_orders,

          COUNT(*) FILTER (
            WHERE payment_status = 'paid'
          )::int AS paid_orders,

          COALESCE(
            SUM(final_price_eur_cents)
            FILTER (
              WHERE payment_status = 'paid'
            ),
            0
          )::bigint AS paid_volume_eur_cents

        FROM orders
      `);

      const row = result.rows[0];

      res.json({
        ok: true,
        dashboard: {
          totalOrders:
            Number(row.total_orders || 0),

          completedOrders:
            Number(row.completed_orders || 0),

          failedOrders:
            Number(row.failed_orders || 0),

          pendingDtoneOrders:
            Number(
              row.pending_dtone_orders || 0
            ),

          reviewOrders:
            Number(row.review_orders || 0),

          paidOrders:
            Number(row.paid_orders || 0),

          paidVolumeEurCents:
            Number(
              row.paid_volume_eur_cents || 0
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin dashboard error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to load dashboard.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — GET SINGLE ORDER
// ------------------------------------------------------------

app.get(
  "/api/admin/orders/:orderId",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const orderId =
        String(req.params.orderId || "").trim();

      if (!orderId) {
        return res.status(400).json({
          ok: false,
          error:
            "Order ID is required.",
        });
      }

      const result = await pool.query(
        `
          SELECT *
          FROM orders
          WHERE order_id = $1
          LIMIT 1
        `,
        [orderId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error:
            "Order not found.",
        });
      }

      res.json({
        ok: true,
        order: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Admin single order error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to load order.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — MARK ORDER FOR REVIEW
// ------------------------------------------------------------

app.post(
  "/api/admin/orders/:orderId/review",
  requireDatabase,
  requireAdmin,
  async (req, res) => {
    try {
      const orderId =
        String(req.params.orderId || "").trim();

      const reason =
        String(
          req.body.reason ||
            "Manual admin review"
        ).trim();

      const result = await pool.query(
        `
          UPDATE orders
          SET
            status = 'review',
            last_error = $2,
            updated_at = NOW()
          WHERE order_id = $1
          RETURNING
            order_id,
            payment_status,
            status,
            last_error,
            updated_at
        `,
        [
          orderId,
          reason,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error:
            "Order not found.",
        });
      }

      res.json({
        ok: true,
        order: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Admin review error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to move order to review.",
      });
    }
  }
);

// ------------------------------------------------------------
// SERVER START
// ------------------------------------------------------------

async function startServer() {
  try {
    if (pool) {
      await pool.query("SELECT 1");
      console.log(
        "Database connection successful."
      );
    } else {
      console.warn(
        "Database is not configured."
      );
    }

    app.listen(PORT, () => {
      console.log(
        `PGNT ASIAN TOPUP backend running on port ${PORT}`
      );

      console.log(
        `APP_BASE_URL: ${APP_BASE_URL}`
      );

      console.log(
        `DT One base URL: ${DTONE_API_BASE_URL}`
      );
    });
  } catch (error) {
    console.error(
      "Server startup error:",
      error
    );

    process.exit(1);
  }
}

startServer();
