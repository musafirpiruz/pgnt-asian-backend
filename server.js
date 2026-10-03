import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import crypto from "crypto";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 4242);

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
);

/*
 * ================================
 * POSTGRESQL
 * ================================
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

/*
 * ================================
 * DT ONE
 * ================================
 */

const DTONE_API_BASE_URL =
  process.env.DTONE_API_BASE_URL ||
  "https://preprod-dvs-api.dtone.com/v1";

/*
 * ================================
 * CORS
 * ================================
 */

app.use(cors());

/*
 * ================================
 * ADMIN SECURITY
 * ================================
 *
 * Render Environment Variable:
 *
 * ADMIN_API_KEY
 *
 * Request header:
 *
 * x-admin-key: YOUR_ADMIN_API_KEY
 */

function requireAdmin(req, res, next) {
  const configuredKey =
    process.env.ADMIN_API_KEY;

  const providedKey =
    req.headers["x-admin-key"];

  if (!configuredKey) {
    return res.status(503).json({
      error:
        "ADMIN_API_KEY is not configured",
    });
  }

  if (
    typeof providedKey !== "string" ||
    providedKey.length !==
      configuredKey.length
  ) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  try {
    const valid =
      crypto.timingSafeEqual(
        Buffer.from(providedKey),
        Buffer.from(configuredKey)
      );

    if (!valid) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }
  } catch (_) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
}

/*
 * ================================
 * DATABASE INITIALIZATION
 * ================================
 */

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL is not configured."
    );

    return;
  }

  /*
   * ORDERS
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,

      order_id TEXT UNIQUE NOT NULL,

      stripe_session_id TEXT UNIQUE,

      country TEXT NOT NULL,

      phone TEXT NOT NULL,

      amount NUMERIC NOT NULL,

      product_id BIGINT NOT NULL,

      currency TEXT NOT NULL
        DEFAULT 'eur',

      charge_cents INTEGER NOT NULL,

      status TEXT NOT NULL
        DEFAULT 'pending',

      dtone_transaction_id TEXT,

      dtone_status TEXT,

      error_message TEXT,

      stripe_refund_id TEXT UNIQUE,

      refund_status TEXT,

      created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      paid_at TIMESTAMPTZ,

      completed_at TIMESTAMPTZ,

      updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);

  /*
   * Add new columns to
   * existing installations.
   */

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS
      stripe_refund_id TEXT UNIQUE;
  `);

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS
      refund_status TEXT;
  `);

  /*
   * ORDERS INDEXES
   */

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
      idx_orders_status
    ON orders(status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
      idx_orders_phone
    ON orders(phone);
  `);

  /*
   * ================================
   * APP SETTINGS
   * ================================
   *
   * Admin controlled:
   *
   * - fee_percent
   * - bonus_percent
   * - fixed_fee_cents
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,

      fee_percent NUMERIC NOT NULL
        DEFAULT 0,

      bonus_percent NUMERIC NOT NULL
        DEFAULT 2,

      fixed_fee_cents INTEGER NOT NULL
        DEFAULT 0,

      updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO app_settings (
      id,
      fee_percent,
      bonus_percent,
      fixed_fee_cents
    )
    VALUES (
      1,
      0,
      2,
      0
    )
    ON CONFLICT (id)
    DO NOTHING;
  `);

  /*
   * ================================
   * PRODUCT PRICES
   * ================================
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_prices (
      id BIGSERIAL PRIMARY KEY,

      product_id BIGINT UNIQUE NOT NULL,

      price_cents INTEGER NOT NULL
        DEFAULT 0,

      currency TEXT NOT NULL
        DEFAULT 'eur',

      updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);

  /*
   * ================================
   * PRODUCT CATALOG
   * ================================
   *
   * Country + Amount + Operator
   * maps to real DT One product.
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id BIGSERIAL PRIMARY KEY,

      country TEXT NOT NULL,

      amount NUMERIC NOT NULL,

      currency TEXT NOT NULL
        DEFAULT 'eur',

      product_id BIGINT NOT NULL,

      operator TEXT NOT NULL
        DEFAULT 'Auto Detect',

      active BOOLEAN NOT NULL
        DEFAULT TRUE,

      updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      UNIQUE (
        country,
        amount,
        currency,
        operator
      )
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
      idx_product_catalog_lookup
    ON product_catalog(
      country,
      amount,
      currency,
      active
    );
  `);

  console.log(
    "PostgreSQL database ready."
  );
}

/*
 * ================================
 * DT ONE AUTHENTICATION
 * ================================
 */

function getDtoneAuth() {
  const apiKey =
    String(
      process.env.DTONE_API_KEY || ""
    ).trim();

  const apiSecret =
    String(
      process.env.DTONE_API_SECRET || ""
    ).trim();

  if (
    !apiKey ||
    !apiSecret
  ) {
    throw new Error(
      "DTONE_API_KEY or DTONE_API_SECRET is not configured"
    );
  }

  return Buffer
    .from(
      `${apiKey}:${apiSecret}`
    )
    .toString("base64");
}

/*
 * ================================
 * CREATE DT ONE TOP-UP
 * ================================
 */

async function createDtoneTopup({
  externalId,
  productId,
  phone,
  callbackUrl,
}) {
  if (
    !externalId ||
    !productId ||
    !phone
  ) {
    throw new Error(
      "externalId, productId and phone are required"
    );
  }

  const response =
    await fetch(
      `${DTONE_API_BASE_URL}/async/transactions`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Basic ${getDtoneAuth()}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            external_id:
              String(externalId),

            product_id:
              Number(productId),

            credit_party_identifier: {
              mobile_number:
                String(phone),
            },

            auto_confirm:
              true,

            callback_url:
              callbackUrl,
          }),
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch (_) {
    data = {
      raw: text,
    };
  }

  if (!response.ok) {
    const error =
      new Error(
        `DT One API error (${response.status})`
      );

    error.status =
      response.status;

    error.response =
      data;

    throw error;
  }

  return data;
}

/*
 * ================================
 * PROCESS PAID ORDER
 * ================================
 *
 * Stripe payment verification
 * happens BEFORE DT One.
 */

async function processPaidOrder(
  session
) {
  if (
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  if (
    !session ||
    !session.id
  ) {
    throw new Error(
      "Invalid Stripe session"
    );
  }

  if (
    session.payment_status !==
    "paid"
  ) {
    throw new Error(
      "Stripe payment is not paid"
    );
  }

  const metadata =
    session.metadata || {};

  const orderId =
    String(
      metadata.orderId || ""
    ).trim();

  const productId =
    Number(
      metadata.productId
    );

  const country =
    String(
      metadata.country || ""
    ).trim();

  const phone =
    String(
      metadata.phone || ""
    ).trim();

  const amount =
    Number(
      metadata.amount
    );

  const finalChargeCents =
    Number(
      metadata.finalChargeCents
    );

  if (!orderId) {
    throw new Error(
      "Stripe metadata orderId is missing"
    );
  }

  if (
    !Number.isInteger(
      productId
    ) ||
    productId <= 0
  ) {
    throw new Error(
      "Invalid productId in Stripe metadata"
    );
  }

  if (
    !country ||
    !phone
  ) {
    throw new Error(
      "Country or phone is missing from Stripe metadata"
    );
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid amount in Stripe metadata"
    );
  }

  if (
    !Number.isInteger(
      finalChargeCents
    ) ||
    finalChargeCents < 1
  ) {
    throw new Error(
      "Invalid finalChargeCents in Stripe metadata"
    );
  }

  /*
   * Verify Stripe amount.
   */

  if (
    Number(
      session.amount_total
    ) !== finalChargeCents
  ) {
    throw new Error(
      `Stripe amount mismatch: expected ${finalChargeCents}, received ${session.amount_total}`
    );
  }

  /*
   * Find order.
   */

  const result =
    await pool.query(
      `
      SELECT
        order_id,
        stripe_session_id,
        country,
        phone,
        amount,
        product_id,
        currency,
        charge_cents,
        status,
        dtone_transaction_id,
        dtone_status
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      `,
      [orderId]
    );

  if (
    result.rows.length === 0
  ) {
    throw new Error(
      `Order not found: ${orderId}`
    );
  }

  const order =
    result.rows[0];

  /*
   * Verify Stripe session.
   */

  if (
    order.stripe_session_id &&
    order.stripe_session_id !==
      session.id
  ) {
    throw new Error(
      "Stripe session does not match order"
    );
  }

  /*
   * Verify stored charge.
   */

  if (
    Number(
      order.charge_cents
    ) !== finalChargeCents
  ) {
    throw new Error(
      "Order charge does not match Stripe amount"
    );
  }

  /*
   * Verify product.
   */

  if (
    String(
      order.product_id
    ) !==
    String(productId)
  ) {
    throw new Error(
      "Product ID mismatch"
    );
  }

  /*
   * Verify country.
   */

  if (
    String(
      order.country
    ).trim() !==
    country
  ) {
    throw new Error(
      "Country mismatch"
    );
  }

  /*
   * Verify phone.
   */

  if (
    String(
      order.phone
    ).trim() !==
    phone
  ) {
    throw new Error(
      "Phone mismatch"
    );
  }

  /*
   * Duplicate protection.
   */

  if (
    order.status === "paid" ||
    order.status === "processing" ||
    order.status === "completed"
  ) {
    console.log(
      "Order already processed:",
      orderId,
      order.status
    );

    return {
      alreadyProcessed:
        true,

      orderId,

      status:
        order.status,
    };
  }

  /*
   * pending -> paid
   */

  const updateResult =
    await pool.query(
      `
      UPDATE orders
      SET
        status = 'paid',

        paid_at =
          COALESCE(
            paid_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE order_id = $1
        AND status = 'pending'

      RETURNING
        order_id,
        country,
        phone,
        amount,
        product_id,
        currency,
        charge_cents,
        status,
        paid_at
      `,
      [orderId]
    );

  if (
    updateResult.rows.length ===
    0
  ) {
    return {
      alreadyProcessed:
        true,

      orderId,
    };
  }

  return updateResult.rows[0];
        }
/*
 * ================================
 * POSTGRESQL
 * ================================
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

/*
 * ================================
 * ADMIN SECURITY
 * ================================
 *
 * Set ADMIN_API_KEY in Render.
 *
 * Admin requests must include:
 *
 * x-admin-key: YOUR_ADMIN_API_KEY
 */

function requireAdmin(req, res, next) {
  const configuredKey =
    process.env.ADMIN_API_KEY;

  const providedKey =
    req.headers["x-admin-key"];

  if (!configuredKey) {
    return res.status(503).json({
      error:
        "ADMIN_API_KEY is not configured",
    });
  }

  if (
    typeof providedKey !== "string" ||
    providedKey.length !==
      configuredKey.length
  ) {
    return res.status(401).json({
      error:
        "Unauthorized",
    });
  }

  try {
    const valid =
      crypto.timingSafeEqual(
        Buffer.from(providedKey),
        Buffer.from(configuredKey)
      );

    if (!valid) {
      return res.status(401).json({
        error:
          "Unauthorized",
      });
    }
  } catch (_) {
    return res.status(401).json({
      error:
        "Unauthorized",
    });
  }

  next();
}

app.use(cors());

/*
 * ================================
 * DATABASE INITIALIZATION
 * ================================
 */

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL is not configured."
    );

    return;
  }

  /*
   * ================================
   * ORDERS
   * ================================
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,

      order_id TEXT UNIQUE NOT NULL,

      stripe_session_id TEXT UNIQUE,

      country TEXT NOT NULL,

      phone TEXT NOT NULL,

      amount NUMERIC NOT NULL,

      product_id BIGINT NOT NULL,

      currency TEXT NOT NULL
        DEFAULT 'eur',

      charge_cents INTEGER NOT NULL,

      status TEXT NOT NULL
        DEFAULT 'pending',

      dtone_transaction_id TEXT,

      dtone_status TEXT,

      error_message TEXT,

      created_at
        TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      paid_at TIMESTAMPTZ,

      completed_at
        TIMESTAMPTZ,

      updated_at
        TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);

  /*
   * Orders indexes
   */

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_orders_status
    ON orders(status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_orders_phone
    ON orders(phone);
  `);

  /*
   * ================================
   * APP SETTINGS
   * ================================
   *
   * Admin controls:
   *
   * fee_percent
   * bonus_percent
   * fixed_fee_cents
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,

      fee_percent NUMERIC
        NOT NULL DEFAULT 0,

      bonus_percent NUMERIC
        NOT NULL DEFAULT 2,

      fixed_fee_cents INTEGER
        NOT NULL DEFAULT 0,

      updated_at
        TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);

  /*
   * Default settings
   */

  await pool.query(`
    INSERT INTO app_settings (
      id,
      fee_percent,
      bonus_percent,
      fixed_fee_cents
    )
    VALUES (
      1,
      0,
      2,
      0
    )
    ON CONFLICT (id)
    DO NOTHING;
  `);

  /*
   * ================================
   * PRODUCT PRICES
   * ================================
   *
   * Admin controls the price
   * of every DT One product.
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_prices (
      id BIGSERIAL PRIMARY KEY,

      product_id BIGINT UNIQUE NOT NULL,

      price_cents INTEGER
        NOT NULL DEFAULT 0,

      currency TEXT
        NOT NULL DEFAULT 'eur',

      updated_at
        TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);

  /*
   * ================================
   * PRODUCT CATALOG
   * ================================
   *
   * Country + Amount
   *        ↓
   * DT One Product ID
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id BIGSERIAL PRIMARY KEY,

      country TEXT NOT NULL,

      amount NUMERIC NOT NULL,

      currency TEXT
        NOT NULL DEFAULT 'eur',

      product_id BIGINT NOT NULL,

      operator TEXT
        NOT NULL DEFAULT 'Auto Detect',

      active BOOLEAN
        NOT NULL DEFAULT TRUE,

      updated_at
        TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      UNIQUE(
        country,
        amount,
        currency,
        operator
      )
    );
  `);

  /*
   * Catalog lookup index
   */

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_product_catalog_lookup
    ON product_catalog(
      country,
      amount,
      currency,
      active
    );
  `);

  console.log(
    "PostgreSQL database ready."
  );
      }
/*
 * ================================
 * STRIPE WEBHOOK
 * ================================
 *
 * IMPORTANT:
 *
 * This route MUST come before
 * express.json().
 *
 * Stripe requires the RAW request
 * body to verify the webhook signature.
 */

app.post(
  "/api/stripe/webhook",

  express.raw({
    type: "application/json",
  }),

  async (req, res) => {
    const signature =
      req.headers[
        "stripe-signature"
      ];

    let event;

    /*
     * ================================
     * 1. VERIFY STRIPE SIGNATURE
     * ================================
     */

    try {
      event =
        stripe.webhooks.constructEvent(
          req.body,
          signature,
          process.env
            .STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
      console.error(
        "Stripe webhook signature error:",
        err.message
      );

      return res
        .status(400)
        .send(
          `Webhook Error: ${err.message}`
        );
    }

    /*
     * ================================
     * 2. PROCESS EVENT
     * ================================
     */

    try {
      /*
       * We only process completed
       * Stripe Checkout sessions.
       */

      if (
        event.type ===
        "checkout.session.completed"
      ) {
        const session =
          event.data.object;

        console.log(
          "STRIPE CHECKOUT COMPLETED:",
          {
            sessionId:
              session.id,

            paymentStatus:
              session.payment_status,

            metadata:
              session.metadata,
          }
        );

        /*
         * ================================
         * 3. PAYMENT MUST BE PAID
         * ================================
         */

        if (
          session.payment_status !==
          "paid"
        ) {
          console.log(
            "Stripe session is not paid:",
            session.id
          );

          return res.json({
            received: true,

            processed: false,

            reason:
              "payment_not_paid",
          });
        }

        /*
         * ================================
         * 4. PAYMENT VERIFIED
         * ================================
         *
         * The actual order verification
         * and DT One fulfillment will be
         * connected in the next section.
         */

        console.log(
          "Stripe payment verified:",
          session.id
        );
      }

      /*
       * Stripe received successfully.
       */

      return res.json({
        received: true,
      });
    } catch (err) {
      console.error(
        "Stripe webhook processing error:",
        err
      );

      return res.status(500).json({
        error:
          "Webhook processing failed",
      });
    }
  }
);

/*
 * ================================
 * NORMAL JSON ROUTES
 * ================================
 *
 * IMPORTANT:
 *
 * express.json() MUST come AFTER
 * the Stripe webhook above.
 */

app.use(
  express.json()
);
/*
 * ================================
 * HEALTH CHECK
 * ================================
 */

app.get(
  "/health",
  async (_req, res) => {
    let database =
      "not_configured";

    /*
     * Check PostgreSQL
     */

    if (
      process.env.DATABASE_URL
    ) {
      try {
        await pool.query(
          "SELECT 1"
        );

        database =
          "connected";
      } catch (err) {
        console.error(
          "Database health check error:",
          err.message
        );

        database =
          "error";
      }
    }

    return res.json({
      ok: true,

      service:
        "pgnt-asian-backend",

      database:
        database,
    });
  }
);

/*
 * ================================
 * PRODUCT CATALOG
 * ================================
 *
 * The Flutter app sends:
 *
 * country + amount + currency
 *
 * The server finds the matching
 * DT One product from PostgreSQL.
 */

/*
 * ================================
 * GET PRODUCT FROM CATALOG
 * ================================
 */

app.get(
  "/api/catalog/product",
  async (req, res) => {
    try {
      const country =
        String(
          req.query.country ||
            ""
        )
          .trim()
          .toLowerCase();

      const amount =
        Number(
          req.query.amount
        );

      const currency =
        String(
          req.query.currency ||
            "eur"
        )
          .trim()
          .toLowerCase();

      /*
       * Validate country
       */

      if (!country) {
        return res.status(400).json({
          error:
            "country is required",
        });
      }

      /*
       * Validate amount
       */

      if (
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount",
        });
      }

      /*
       * Validate currency
       */

      if (
        !/^[a-z]{3}$/.test(
          currency
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid currency",
        });
      }

      /*
       * Find active product
       */

      const result =
        await pool.query(
          `
          SELECT
            country,
            amount,
            currency,
            product_id,
            operator
          FROM product_catalog
          WHERE LOWER(country) = $1
            AND amount = $2
            AND LOWER(currency) = $3
            AND active = TRUE
          ORDER BY id ASC
          LIMIT 1
          `,
          [
            country,
            amount,
            currency,
          ]
        );

      /*
       * Product not configured
       */

      if (
        result.rows.length ===
        0
      ) {
        return res.status(404).json({
          error:
            "Product is not configured",
        });
      }

      /*
       * Return product
       */

      return res.json({
        success: true,

        product:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Catalog lookup error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to read product catalog",
      });
    }
  }
);
/*
 * ================================
 * ADMIN PRODUCT CATALOG
 * ================================
 *
 * Admin controls the mapping:
 *
 * Country + Amount + Currency
 *          ↓
 *   DT One Product ID
 *          ↓
 *       Operator
 *
 * Security:
 * ADMIN_API_KEY must be configured
 * in Render Environment Variables.
 */

/*
 * ================================
 * ADD / UPDATE CATALOG PRODUCT
 * ================================
 */

app.put(
  "/api/admin/catalog/product",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        country,
        amount,
        currency,
        productId,
        operator,
        active,
      } = req.body || {};

      /*
       * Normalize country
       */

      const normalizedCountry =
        String(
          country || ""
        )
          .trim()
          .toLowerCase();

      /*
       * Convert amount
       */

      const numericAmount =
        Number(amount);

      /*
       * Normalize currency
       */

      const normalizedCurrency =
        String(
          currency || "eur"
        )
          .trim()
          .toLowerCase();

      /*
       * Convert product ID
       */

      const numericProductId =
        Number(productId);

      /*
       * Operator
       */

      const normalizedOperator =
        String(
          operator ||
            "Auto Detect"
        ).trim();

      /*
       * Active
       */

      const isActive =
        active !== false;

      /*
       * ================================
       * VALIDATION
       * ================================
       */

      if (
        !normalizedCountry
      ) {
        return res.status(400).json({
          error:
            "country is required",
        });
      }

      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount",
        });
      }

      if (
        !/^[a-z]{3}$/.test(
          normalizedCurrency
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid currency",
        });
      }

      if (
        !Number.isInteger(
          numericProductId
        ) ||
        numericProductId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid productId",
        });
      }

      /*
       * ================================
       * INSERT / UPDATE
       * ================================
       */

      const result =
        await pool.query(
          `
          INSERT INTO product_catalog (
            country,
            amount,
            currency,
            product_id,
            operator,
            active,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            NOW()
          )
          ON CONFLICT (
            country,
            amount,
            currency,
            operator
          )
          DO UPDATE SET
            product_id =
              EXCLUDED.product_id,

            active =
              EXCLUDED.active,

            updated_at =
              NOW()

          RETURNING
            country,
            amount,
            currency,
            product_id,
            operator,
            active,
            updated_at
          `,
          [
            normalizedCountry,
            numericAmount,
            normalizedCurrency,
            numericProductId,
            normalizedOperator,
            isActive,
          ]
        );

      /*
       * ================================
       * SUCCESS
       * ================================
       */

      return res.json({
        success: true,

        product:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Catalog update error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to update product catalog",
      });
    }
  }
);

/*
 * ================================
 * GET ALL CATALOG PRODUCTS
 * ================================
 *
 * Admin can see all configured
 * catalog products.
 */

app.get(
  "/api/admin/catalog/products",
  requireAdmin,
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            country,
            amount,
            currency,
            product_id,
            operator,
            active,
            updated_at
          FROM product_catalog
          ORDER BY
            country ASC,
            amount ASC,
            operator ASC
          `
        );

      return res.json({
        success: true,

        products:
          result.rows,
      });
    } catch (err) {
      console.error(
        "Catalog list error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to read product catalog",
      });
    }
  }
);
/*
 * ================================
 * PROCESS PAID ORDER
 * ================================
 *
 * Stripe payment verification
 * BEFORE any DT One fulfillment.
 *
 * IMPORTANT:
 * This function must exist ONLY ONCE
 * in the entire server.js file.
 */

async function processPaidOrder(
  session
) {
  /*
   * ================================
   * 1. DATABASE CHECK
   * ================================
   */

  if (
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  /*
   * ================================
   * 2. STRIPE SESSION CHECK
   * ================================
   */

  if (
    !session ||
    !session.id
  ) {
    throw new Error(
      "Invalid Stripe session"
    );
  }

  /*
   * Payment must actually be paid.
   */

  if (
    session.payment_status !==
    "paid"
  ) {
    throw new Error(
      "Stripe payment is not paid"
    );
  }

  /*
   * ================================
   * 3. READ STRIPE METADATA
   * ================================
   */

  const metadata =
    session.metadata || {};

  const orderId =
    String(
      metadata.orderId || ""
    ).trim();

  const productId =
    Number(
      metadata.productId
    );

  const country =
    String(
      metadata.country || ""
    ).trim();

  const phone =
    String(
      metadata.phone || ""
    ).trim();

  const amount =
    Number(
      metadata.amount
    );

  const finalChargeCents =
    Number(
      metadata.finalChargeCents
    );

  /*
   * ================================
   * 4. VALIDATE METADATA
   * ================================
   */

  if (!orderId) {
    throw new Error(
      "Stripe metadata orderId is missing"
    );
  }

  if (
    !Number.isInteger(
      productId
    ) ||
    productId <= 0
  ) {
    throw new Error(
      "Invalid productId in Stripe metadata"
    );
  }

  if (
    !country ||
    !phone
  ) {
    throw new Error(
      "Country or phone is missing from Stripe metadata"
    );
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid amount in Stripe metadata"
    );
  }

  if (
    !Number.isInteger(
      finalChargeCents
    ) ||
    finalChargeCents < 1
  ) {
    throw new Error(
      "Invalid finalChargeCents in Stripe metadata"
    );
  }

  /*
   * ================================
   * 5. VERIFY STRIPE AMOUNT
   * ================================
   */

  if (
    Number(
      session.amount_total
    ) !== finalChargeCents
  ) {
    throw new Error(
      `Stripe amount mismatch: expected ${finalChargeCents}, received ${session.amount_total}`
    );
  }

  /*
   * ================================
   * 6. FIND ORDER
   * ================================
   */

  const result =
    await pool.query(
      `
      SELECT
        order_id,
        stripe_session_id,
        country,
        phone,
        amount,
        product_id,
        currency,
        charge_cents,
        status,
        dtone_transaction_id,
        dtone_status
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      `,
      [
        orderId,
      ]
    );

  /*
   * Order must exist.
   */

  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      `Order not found: ${orderId}`
    );
  }

  const order =
    result.rows[0];

  /*
   * ================================
   * 7. VERIFY STRIPE SESSION
   * ================================
   */

  if (
    order.stripe_session_id &&
    order.stripe_session_id !==
      session.id
  ) {
    throw new Error(
      "Stripe session does not match order"
    );
  }

  /*
   * ================================
   * 8. VERIFY STORED CHARGE
   * ================================
   */

  if (
    Number(
      order.charge_cents
    ) !== finalChargeCents
  ) {
    throw new Error(
      "Order charge does not match Stripe amount"
    );
  }

  /*
   * ================================
   * 9. VERIFY PRODUCT
   * ================================
   */

  if (
    String(
      order.product_id
    ) !==
    String(
      productId
    )
  ) {
    throw new Error(
      "Product ID mismatch"
    );
  }

  /*
   * ================================
   * 10. VERIFY COUNTRY
   * ================================
   */

  if (
    String(
      order.country
    ).trim() !==
    country
  ) {
    throw new Error(
      "Country mismatch"
    );
  }

  /*
   * ================================
   * 11. VERIFY PHONE
   * ================================
   */

  if (
    String(
      order.phone
    ).trim() !==
    phone
  ) {
    throw new Error(
      "Phone mismatch"
    );
  }

  /*
   * ================================
   * 12. IDEMPOTENCY
   * ================================
   *
   * Prevent duplicate webhook
   * processing.
   */

  if (
    order.status ===
      "paid" ||
    order.status ===
      "processing" ||
    order.status ===
      "completed"
  ) {
    console.log(
      "Order already processed:",
      orderId,
      order.status
    );

    return {
      alreadyProcessed:
        true,

      orderId:
        orderId,

      status:
        order.status,
    };
  }

  /*
   * ================================
   * 13. CHANGE PENDING -> PAID
   * ================================
   *
   * The WHERE status = 'pending'
   * protects against duplicate
   * webhook processing.
   */

  const updateResult =
    await pool.query(
      `
      UPDATE orders
      SET
        status = 'paid',

        paid_at =
          COALESCE(
            paid_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE order_id = $1
        AND status = 'pending'

      RETURNING
        order_id,
        country,
        phone,
        amount,
        product_id,
        currency,
        charge_cents,
        status,
        paid_at
      `,
      [
        orderId,
      ]
    );

  /*
   * Another process may have
   * changed the order first.
   */

  if (
    updateResult.rows.length ===
    0
  ) {
    console.log(
      "Order was already changed by another process:",
      orderId
    );

    return {
      alreadyProcessed:
        true,

      orderId:
        orderId,
    };
  }

  const verifiedOrder =
    updateResult.rows[0];

  console.log(
    "ORDER PAYMENT VERIFIED:",
    verifiedOrder
  );

  return verifiedOrder;
}
/*
 * ================================
 * DT ONE CONFIGURATION
 * ================================
 *
 * IMPORTANT:
 *
 * DT One API Key and API Secret
 * must NEVER be placed inside
 * the Flutter application.
 *
 * They stay ONLY on the server.
 */

const DTONE_API_BASE_URL =
  process.env.DTONE_API_BASE_URL ||
  "https://preprod-dvs-api.dtone.com/v1";

/*
 * ================================
 * GET DT ONE AUTHENTICATION
 * ================================
 *
 * DT One uses HTTP Basic
 * Authentication:
 *
 * API KEY : API SECRET
 *
 * The result is converted to
 * Base64 and sent in the
 * Authorization header.
 */

function getDtoneAuth() {
  const apiKey =
    String(
      process.env.DTONE_API_KEY ||
        ""
    ).trim();

  const apiSecret =
    String(
      process.env.DTONE_API_SECRET ||
        ""
    ).trim();

  /*
   * Both credentials are required.
   */

  if (
    !apiKey ||
    !apiSecret
  ) {
    throw new Error(
      "DTONE_API_KEY or DTONE_API_SECRET is not configured"
    );
  }

  /*
   * Create Basic Auth value.
   */

  return Buffer
    .from(
      `${apiKey}:${apiSecret}`
    )
    .toString("base64");
}

/*
 * ================================
 * CREATE DT ONE TOP-UP
 * ================================
 *
 * IMPORTANT:
 *
 * productId must be a real DT One
 * product ID configured in the
 * product_catalog table.
 */

async function createDtoneTopup({
  externalId,
  productId,
  phone,
  callbackUrl,
}) {
  /*
   * Get server-side DT One
   * authentication.
   */

  const authorization =
    getDtoneAuth();

  /*
   * Validate required values.
   */

  if (
    !externalId ||
    !productId ||
    !phone
  ) {
    throw new Error(
      "externalId, productId and phone are required"
    );
  }

  /*
   * ================================
   * SEND REQUEST TO DT ONE
   * ================================
   */

  const response =
    await fetch(
      `${DTONE_API_BASE_URL}/async/transactions`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Basic ${authorization}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            /*
             * Our PGNT order ID.
             */

            external_id:
              String(
                externalId
              ),

            /*
             * Real DT One product.
             */

            product_id:
              Number(
                productId
              ),

            /*
             * Customer phone.
             */

            credit_party_identifier: {
              mobile_number:
                String(
                  phone
                ),
            },

            /*
             * Automatically confirm
             * the transaction.
             */

            auto_confirm:
              true,

            /*
             * DT One will send the
             * transaction status here.
             */

            callback_url:
              callbackUrl,
          }),
      }
    );

  /*
   * ================================
   * READ DT ONE RESPONSE
   * ================================
   */

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch (_) {
    data = {
      raw: text,
    };
  }

  /*
   * ================================
   * HANDLE DT ONE ERROR
   * ================================
   */

  if (
    !response.ok
  ) {
    const error =
      new Error(
        `DT One API error (${response.status})`
      );

    /*
     * Save HTTP status.
     */

    error.status =
      response.status;

    /*
     * Save DT One response
     * for server-side logging.
     */

    error.response =
      data;

    throw error;
  }

  /*
   * ================================
   * SUCCESS
   * ================================
   */

  return data;
}
