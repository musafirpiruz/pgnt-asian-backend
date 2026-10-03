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
 * PostgreSQL
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
 * Send it in the request header:
 * x-admin-key: YOUR_ADMIN_API_KEY
 */

function requireAdmin(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers["x-admin-key"];

  if (!configuredKey) {
    return res.status(503).json({
      error: "ADMIN_API_KEY is not configured",
    });
  }

  if (
    typeof providedKey !== "string" ||
    providedKey.length !== configuredKey.length
  ) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  try {
    const valid = crypto.timingSafeEqual(
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

app.use(cors());

/*
 * ================================
 * DATABASE INITIALIZATION
 * ================================
 */

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not configured.");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      stripe_session_id TEXT UNIQUE,
      country TEXT NOT NULL,
      phone TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      product_id BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'eur',
      charge_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      dtone_transaction_id TEXT,
      dtone_status TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_phone
    ON orders(phone);
  `);

  /*
   * Fee / bonus settings controlled by Admin.
   *
   * fee_percent: percentage added to the base charge.
   * bonus_percent: bonus shown/managed by Admin.
   * fixed_fee_cents: fixed fee added in the selected currency's
   * smallest unit. This project currently uses EUR cents.
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,
      fee_percent NUMERIC NOT NULL DEFAULT 0,
      bonus_percent NUMERIC NOT NULL DEFAULT 2,
      fixed_fee_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO app_settings (
      id,
      fee_percent,
      bonus_percent,
      fixed_fee_cents
    )
    VALUES (1, 0, 2, 0)
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_prices (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT UNIQUE NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'eur',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  /*
   * Server-controlled mapping between the app amount/country
   * and a real DT One product ID.
   *
   * Product IDs must come from the user's DT One account.
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id BIGSERIAL PRIMARY KEY,
      country TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'eur',
      product_id BIGINT NOT NULL,
      operator TEXT NOT NULL DEFAULT 'Auto Detect',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(country, amount, currency, operator)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_product_catalog_lookup
    ON product_catalog(country, amount, currency, active);
  `);

  console.log("PostgreSQL database ready.");
}
/*
 * ================================
 * STRIPE WEBHOOK
 * ================================
 *
 * IMPORTANT:
 * This route MUST come before express.json().
 * Stripe needs the RAW request body to verify
 * the webhook signature.
 */

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature =
      req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(
        "Stripe webhook signature error:",
        err.message
      );

      return res
        .status(400)
        .send(`Webhook Error: ${err.message}`);
    }

    try {
      /*
       * We only process completed Checkout sessions.
       */
      if (
        event.type ===
        "checkout.session.completed"
      ) {
        const session =
          event.data.object;

        console.log(
          "STRIPE CHECKOUT COMPLETED",
          {
            sessionId: session.id,
            paymentStatus:
              session.payment_status,
            metadata:
              session.metadata,
          }
        );

        /*
         * Payment must actually be paid.
         *
         * IMPORTANT:
         * We do NOT send a top-up from this webhook
         * until the payment/order verification function
         * has completed successfully.
         */

        if (
          session.payment_status !== "paid"
        ) {
          console.log(
            "Stripe session is not paid:",
            session.id
          );

          return res.json({
            received: true,
            processed: false,
            reason: "payment_not_paid",
          });
        }

        /*
         * The verified order-processing function
         * will be added in the next section.
         */
        console.log(
          "Stripe payment verified:",
          session.id
        );
      }

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
 * This MUST come AFTER the Stripe webhook.
 */

app.use(express.json());

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

    if (process.env.DATABASE_URL) {
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
      database,
    });
  }
);

/*
 * ================================
 * PRODUCT CATALOG
 * ================================
 *
 * The mobile app sends country + amount.
 * The server finds the correct DT One
 * product ID from this table.
 */

/*
 * GET PRODUCT FROM CATALOG
 */

app.get(
  "/api/catalog/product",
  async (req, res) => {
    try {
      const country =
        String(
          req.query.country || ""
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

      if (!country) {
        return res.status(400).json({
          error:
            "country is required",
        });
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount",
        });
      }

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

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Product is not configured",
        });
      }

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
 * Admin can create/update the mapping:
 *
 * Country + Amount
 *       ↓
 * Real DT One Product ID
 */

/*
 * ADD / UPDATE CATALOG PRODUCT
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

      const normalizedCountry =
        String(
          country || ""
        )
          .trim()
          .toLowerCase();

      const numericAmount =
        Number(amount);

      const normalizedCurrency =
        String(
          currency || "eur"
        )
          .trim()
          .toLowerCase();

      const numericProductId =
        Number(productId);

      const normalizedOperator =
        String(
          operator ||
            "Auto Detect"
        ).trim();

      const isActive =
        active !== false;

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
 * GET ALL ACTIVE CATALOG PRODUCTS
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
 * BEFORE any fulfillment.
 *
 * IMPORTANT:
 * This function must exist ONLY ONCE
 * in the entire server.js file.
 */

async function processPaidOrder(session) {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  if (!session || !session.id) {
    throw new Error(
      "Invalid Stripe session"
    );
  }

  /*
   * 1. Stripe payment must be paid
   */

  if (
    session.payment_status !== "paid"
  ) {
    throw new Error(
      "Stripe payment is not paid"
    );
  }

  /*
   * 2. Read Stripe metadata
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
   * 3. Validate metadata
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
   * 4. Verify Stripe amount
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
   * 5. Find the order
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
   * 6. Verify Stripe session
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
   * 7. Verify stored charge
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
   * 8. Verify product
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
   * 9. Verify country
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
   * 10. Verify phone
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
   * 11. Idempotency / duplicate protection
   *
   * If another webhook already processed
   * this order, do nothing.
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
      alreadyProcessed: true,
      orderId,
      status: order.status,
    };
  }

  /*
   * 12. Change pending -> paid
   *
   * The WHERE status = 'pending'
   * protects against duplicate webhook processing.
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
        updated_at = NOW()
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
    updateResult.rows.length === 0
  ) {
    console.log(
      "Order was already changed by another process:",
      orderId
    );

    return {
      alreadyProcessed: true,
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
 */

const DTONE_API_BASE_URL =
  process.env.DTONE_API_BASE_URL ||
  "https://preprod-dvs-api.dtone.com/v1";

/*
 * Get DT One Basic Authentication
 *
 * IMPORTANT:
 * DT One API Key and Secret stay
 * ONLY on the server.
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
 *
 * IMPORTANT:
 * productId must be a real DT One
 * product ID from the configured catalog.
 */

async function createDtoneTopup({
  externalId,
  productId,
  phone,
  callbackUrl,
}) {
  const authorization =
    getDtoneAuth();

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
            `Basic ${authorization}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            external_id:
              String(
                externalId
              ),

            product_id:
              Number(
                productId
              ),

            credit_party_identifier: {
              mobile_number:
                String(
                  phone
                ),
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

  if (
    !response.ok
  ) {
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
 * START DT ONE FULFILLMENT
 * ================================
 *
 * This function runs ONLY after
 * Stripe payment has been verified.
 */

async function fulfillPaidOrder(
  order
) {
  if (
    !order ||
    !order.order_id
  ) {
    throw new Error(
      "Invalid order"
    );
  }

  /*
   * Prevent duplicate fulfillment.
   */

  if (
    order.status ===
      "completed"
  ) {
    return {
      alreadyCompleted:
        true,

      orderId:
        order.order_id,
    };
  }

  if (
    order.status ===
      "processing"
  ) {
    return {
      alreadyProcessing:
        true,

      orderId:
        order.order_id,
    };
  }

  /*
   * Mark order as processing.
   */

  const processing =
    await pool.query(
      `
      UPDATE orders
      SET
        status = 'processing',
        updated_at = NOW()
      WHERE order_id = $1
        AND status = 'paid'
      RETURNING
        order_id,
        country,
        phone,
        product_id,
        status
      `,
      [
        order.order_id,
      ]
    );

  /*
   * Another process may have
   * already started fulfillment.
   */

  if (
    processing.rows.length ===
    0
  ) {
    console.log(
      "Order fulfillment already started:",
      order.order_id
    );

    return {
      alreadyProcessing:
        true,

      orderId:
        order.order_id,
    };
  }

  const paidOrder =
    processing.rows[0];

  /*
   * DT One callback URL.
   *
   * This URL will receive the
   * final DT One transaction status.
   */

  const callbackUrl =
    `${process.env.APP_BASE_URL}/api/dtone/callback`;

  try {
    const dtone =
      await createDtoneTopup({
        externalId:
          paidOrder.order_id,

        productId:
          paidOrder.product_id,

        phone:
          paidOrder.phone,

        callbackUrl:
          callbackUrl,
      });

    /*
     * DT One normally returns
     * a transaction identifier.
     */

    const transactionId =
      dtone?.id ||
      dtone?.transaction_id ||
      dtone?.transaction?.id ||
      null;

    const dtoneStatus =
      String(
        dtone?.status ||
        dtone?.transaction_status ||
        "pending"
      );

    /*
     * Save DT One information.
     */

    await pool.query(
      `
      UPDATE orders
      SET
        dtone_transaction_id = $1,
        dtone_status = $2,
        updated_at = NOW()
      WHERE order_id = $3
      `,
      [
        transactionId
          ? String(
              transactionId
            )
          : null,

        dtoneStatus,

        paidOrder.order_id,
      ]
    );

    console.log(
      "DT ONE TOP-UP CREATED:",
      {
        orderId:
          paidOrder.order_id,

        transactionId:
          transactionId,

        status:
          dtoneStatus,
      }
    );

    return {
      success: true,

      orderId:
        paidOrder.order_id,

      transactionId:
        transactionId,

      dtoneStatus:
        dtoneStatus,
    };
  } catch (err) {
    /*
     * DT One failed before
     * transaction creation.
     *
     * Save the error so Admin
     * can review/refund later.
     */

    await pool.query(
      `
      UPDATE orders
      SET
        status = 'failed',
        error_message = $1,
        updated_at = NOW()
      WHERE order_id = $2
      `,
      [
        String(
          err.message ||
            "DT One fulfillment failed"
        ),

        paidOrder.order_id,
      ]
    );

    console.error(
      "DT One fulfillment failed:",
      err
    );

    throw err;
  }
}
/*
 * ================================
 * DT ONE CALLBACK
 * ================================
 *
 * DT One uses this endpoint to send
 * the final transaction status.
 *
 * IMPORTANT:
 * The callback must update the existing
 * order only. It must NEVER create a
 * new order.
 */

app.post(
  "/api/dtone/callback",
  async (req, res) => {
    try {
      const body =
        req.body || {};

      console.log(
        "DT ONE CALLBACK RECEIVED:",
        body
      );

      /*
       * Try to read the transaction ID
       * and external/order ID.
       *
       * DT One response fields can vary
       * depending on the API response.
       */

      const transactionId =
        body.id ||
        body.transaction_id ||
        body.transaction?.id ||
        null;

      const externalId =
        body.external_id ||
        body.transaction?.external_id ||
        null;

      const status =
        String(
          body.status ||
          body.transaction_status ||
          body.transaction?.status ||
          ""
        )
          .trim()
          .toLowerCase();

      /*
       * We need at least an order ID
       * or DT One transaction ID.
       */

      if (
        !externalId &&
        !transactionId
      ) {
        console.error(
          "DT One callback has no transaction identifier"
        );

        return res.status(400).json({
          error:
            "Missing transaction identifier",
        });
      }

      /*
       * Final DT One statuses.
       *
       * We keep this mapping conservative.
       */

      const successStatuses =
        new Set([
          "completed",
          "successful",
          "success",
          "succeeded",
        ]);

      const failedStatuses =
        new Set([
          "failed",
          "failure",
          "rejected",
          "cancelled",
          "canceled",
        ]);

      /*
       * Find the order.
       */

      let result;

      if (externalId) {
        result =
          await pool.query(
            `
            SELECT
              order_id,
              status,
              dtone_transaction_id,
              dtone_status
            FROM orders
            WHERE order_id = $1
            LIMIT 1
            `,
            [
              String(
                externalId
              ),
            ]
          );
      } else {
        result =
          await pool.query(
            `
            SELECT
              order_id,
              status,
              dtone_transaction_id,
              dtone_status
            FROM orders
            WHERE dtone_transaction_id = $1
            LIMIT 1
            `,
            [
              String(
                transactionId
              ),
            ]
          );
      }

      if (
        result.rows.length === 0
      ) {
        console.error(
          "DT One callback order not found:",
          {
            externalId,
            transactionId,
          }
        );

        /*
         * Return 200 so DT One does not
         * repeatedly resend an unknown
         * callback forever.
         */

        return res.json({
          received: true,
          matched: false,
        });
      }

      const order =
        result.rows[0];

      /*
       * Prevent old callbacks from
       * overwriting a completed order.
       */

      if (
        order.status ===
          "completed"
      ) {
        console.log(
          "Order already completed:",
          order.order_id
        );

        return res.json({
          received: true,
          alreadyCompleted:
            true,
        });
      }

      /*
       * Save the latest DT One status.
       */

      if (
        successStatuses.has(
          status
        )
      ) {
        const update =
          await pool.query(
            `
            UPDATE orders
            SET
              status = 'completed',
              dtone_transaction_id =
                COALESCE(
                  $1,
                  dtone_transaction_id
                ),
              dtone_status = $2,
              completed_at =
                COALESCE(
                  completed_at,
                  NOW()
                ),
              updated_at = NOW()
            WHERE order_id = $3
            RETURNING
              order_id,
              status,
              dtone_transaction_id,
              dtone_status,
              completed_at
            `,
            [
              transactionId
                ? String(
                    transactionId
                  )
                : null,

              status,

              order.order_id,
            ]
          );

        console.log(
          "DT ONE ORDER COMPLETED:",
          update.rows[0]
        );

        return res.json({
          received: true,
          success: true,
          order:
            update.rows[0],
        });
      }

      /*
       * Failed transaction.
       *
       * We do NOT automatically refund
       * here yet. Refund logic will be
       * added separately after the order
       * status system is complete.
       */

      if (
        failedStatuses.has(
          status
        )
      ) {
        const errorMessage =
          String(
            body.error_message ||
            body.error ||
            body.message ||
            `DT One transaction status: ${status}`
          );

        const update =
          await pool.query(
            `
            UPDATE orders
            SET
              status = 'failed',
              dtone_transaction_id =
                COALESCE(
                  $1,
                  dtone_transaction_id
                ),
              dtone_status = $2,
              error_message = $3,
              updated_at = NOW()
            WHERE order_id = $4
            RETURNING
              order_id,
              status,
              dtone_transaction_id,
              dtone_status,
              error_message
            `,
            [
              transactionId
                ? String(
                    transactionId
                  )
                : null,

              status,

              errorMessage,

              order.order_id,
            ]
          );

        console.log(
          "DT ONE ORDER FAILED:",
          update.rows[0]
        );

        return res.json({
          received: true,
          success: false,
          order:
            update.rows[0],
        });
      }

      /*
       * Pending / processing / other
       * statuses are saved without
       * marking the order completed.
       */

      const update =
        await pool.query(
          `
          UPDATE orders
          SET
            dtone_transaction_id =
              COALESCE(
                $1,
                dtone_transaction_id
              ),
            dtone_status = $2,
            updated_at = NOW()
          WHERE order_id = $3
          RETURNING
            order_id,
            status,
            dtone_transaction_id,
            dtone_status
          `,
          [
            transactionId
              ? String(
                  transactionId
                )
              : null,

            status ||
              "unknown",

            order.order_id,
          ]
        );

      console.log(
        "DT ONE ORDER STATUS UPDATED:",
        update.rows[0]
      );

      return res.json({
        received: true,
        pending: true,
        order:
          update.rows[0],
      });
    } catch (err) {
      console.error(
        "DT One callback error:",
        err
      );

      return res.status(500).json({
        error:
          "DT One callback processing failed",
      });
    }
  }
);

/*
 * ================================
 * GET ORDER STATUS
 * ================================
 *
 * The Flutter app can use this
 * endpoint to check an order.
 */

app.get(
  "/api/orders/:orderId",
  async (req, res) => {
    try {
      const orderId =
        String(
          req.params.orderId ||
            ""
        ).trim();

      if (!orderId) {
        return res.status(400).json({
          error:
            "orderId is required",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            order_id,
            country,
            phone,
            amount,
            product_id,
            currency,
            charge_cents,
            status,
            dtone_transaction_id,
            dtone_status,
            error_message,
            created_at,
            paid_at,
            completed_at,
            updated_at
          FROM orders
          WHERE order_id = $1
          LIMIT 1
          `,
          [orderId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Order not found",
        });
      }

      return res.json({
        success: true,
        order:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Order status error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to read order status",
      });
    }
  }
);
/*
 * ================================
 * ADMIN SETTINGS
 * ================================
 *
 * Admin controls:
 * - Fee percentage
 * - Bonus percentage
 * - Fixed fee
 *
 * Security:
 * ADMIN_API_KEY must be configured
 * in Render Environment Variables.
 */

/*
 * GET ADMIN SETTINGS
 */

app.get(
  "/api/admin/settings",
  requireAdmin,
  async (_req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT
            fee_percent,
            bonus_percent,
            fixed_fee_cents,
            updated_at
          FROM app_settings
          WHERE id = 1
          LIMIT 1
        `);

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Settings not found",
        });
      }

      return res.json({
        success: true,
        settings:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Admin settings read error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to read admin settings",
      });
    }
  }
);

/*
 * UPDATE ADMIN SETTINGS
 */

app.put(
  "/api/admin/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        feePercent,
        bonusPercent,
        fixedFeeCents,
      } = req.body || {};

      const fee =
        Number(
          feePercent
        );

      const bonus =
        Number(
          bonusPercent
        );

      const fixedFee =
        Number(
          fixedFeeCents
        );

      /*
       * Validate values
       */

      if (
        !Number.isFinite(
          fee
        ) ||
        !Number.isFinite(
          bonus
        ) ||
        !Number.isInteger(
          fixedFee
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid fee, bonus or fixed fee",
        });
      }

      /*
       * Fee: 0 - 100%
       */

      if (
        fee < 0 ||
        fee > 100
      ) {
        return res.status(400).json({
          error:
            "feePercent must be between 0 and 100",
        });
      }

      /*
       * Bonus: 0 - 100%
       */

      if (
        bonus < 0 ||
        bonus > 100
      ) {
        return res.status(400).json({
          error:
            "bonusPercent must be between 0 and 100",
        });
      }

      /*
       * Fixed fee cannot be negative.
       */

      if (
        fixedFee < 0
      ) {
        return res.status(400).json({
          error:
            "fixedFeeCents cannot be negative",
        });
      }

      const result =
        await pool.query(
          `
          UPDATE app_settings
          SET
            fee_percent = $1,
            bonus_percent = $2,
            fixed_fee_cents = $3,
            updated_at = NOW()
          WHERE id = 1
          RETURNING
            fee_percent,
            bonus_percent,
            fixed_fee_cents,
            updated_at
          `,
          [
            fee,
            bonus,
            fixedFee,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Settings not found",
        });
      }

      return res.json({
        success: true,
        settings:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Admin settings update error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to update admin settings",
      });
    }
  }
);

/*
 * ================================
 * ADMIN PRODUCT PRICE
 * ================================
 *
 * Admin controls the customer price
 * for every DT One product.
 */

/*
 * GET PRODUCT PRICE
 */

app.get(
  "/api/admin/product-prices/:productId",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        Number(
          req.params.productId
        );

      if (
        !Number.isInteger(
          productId
        ) ||
        productId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid productId",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            product_id,
            price_cents,
            currency,
            updated_at
          FROM product_prices
          WHERE product_id = $1
          LIMIT 1
          `,
          [productId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Product price not found",
        });
      }

      return res.json({
        success: true,
        product:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Product price read error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to read product price",
      });
    }
  }
);

/*
 * SET / UPDATE PRODUCT PRICE
 */

app.put(
  "/api/admin/product-prices/:productId",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        Number(
          req.params.productId
        );

      const priceCents =
        Number(
          req.body?.priceCents
        );

      const currency =
        String(
          req.body?.currency ||
            "eur"
        )
          .trim()
          .toLowerCase();

      if (
        !Number.isInteger(
          productId
        ) ||
        productId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid productId",
        });
      }

      if (
        !Number.isInteger(
          priceCents
        ) ||
        priceCents < 1
      ) {
        return res.status(400).json({
          error:
            "priceCents must be a positive integer",
        });
      }

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

      const result =
        await pool.query(
          `
          INSERT INTO product_prices (
            product_id,
            price_cents,
            currency,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            NOW()
          )
          ON CONFLICT (
            product_id
          )
          DO UPDATE SET
            price_cents =
              EXCLUDED.price_cents,
            currency =
              EXCLUDED.currency,
            updated_at =
              NOW()
          RETURNING
            product_id,
            price_cents,
            currency,
            updated_at
          `,
          [
            productId,
            priceCents,
            currency,
          ]
        );

      return res.json({
        success: true,
        product:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Product price update error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to update product price",
      });
    }
  }
);
/*
 * ================================
 * CREATE STRIPE CHECKOUT
 * ================================
 *
 * IMPORTANT:
 * Flutter does NOT control:
 *
 * - Product price
 * - Fee
 * - Fixed fee
 * - Final Stripe charge
 *
 * The server calculates everything.
 */

app.post(
  "/api/payments/checkout",
  async (req, res) => {
    try {
      const {
        country,
        phone,
        amount,
        productId,
      } = req.body || {};

      /*
       * ================================
       * 1. BASIC VALIDATION
       * ================================
       */

      if (
        !country ||
        !phone ||
        !amount ||
        !productId
      ) {
        return res.status(400).json({
          error:
            "country, phone, amount and productId are required",
        });
      }

      const normalizedCountry =
        String(
          country
        ).trim();

      const normalizedPhone =
        String(
          phone
        ).trim();

      const numericAmount =
        Number(amount);

      const numericProductId =
        Number(productId);

      if (
        !/^[0-9+][0-9\s-]{6,20}$/.test(
          normalizedPhone
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid phone number",
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

      if (
        !process.env.DATABASE_URL
      ) {
        return res.status(503).json({
          error:
            "Database is not configured",
        });
      }

      if (
        !process.env.APP_BASE_URL
      ) {
        return res.status(503).json({
          error:
            "APP_BASE_URL is not configured",
        });
      }

      /*
       * ================================
       * 2. GET PRODUCT PRICE
       * ================================
       *
       * Price comes ONLY from database.
       */

      const priceResult =
        await pool.query(
          `
          SELECT
            product_id,
            price_cents,
            currency
          FROM product_prices
          WHERE product_id = $1
          LIMIT 1
          `,
          [
            numericProductId,
          ]
        );

      if (
        priceResult.rows.length ===
        0
      ) {
        return res.status(400).json({
          error:
            "Product price is not configured",
        });
      }

      const product =
        priceResult.rows[0];

      const basePriceCents =
        Number(
          product.price_cents
        );

      const currency =
        String(
          product.currency ||
            "eur"
        )
          .trim()
          .toLowerCase();

      if (
        !Number.isInteger(
          basePriceCents
        ) ||
        basePriceCents <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid product price",
        });
      }

      if (
        !/^[a-z]{3}$/.test(
          currency
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid product currency",
        });
      }

      /*
       * ================================
       * 3. VERIFY CATALOG
       * ================================
       *
       * Country + amount must point
       * to the same DT One product.
       */

      const catalogResult =
        await pool.query(
          `
          SELECT
            country,
            amount,
            currency,
            product_id,
            operator,
            active
          FROM product_catalog
          WHERE LOWER(country) = LOWER($1)
            AND amount = $2
            AND LOWER(currency) = LOWER($3)
            AND product_id = $4
            AND active = TRUE
          LIMIT 1
          `,
          [
            normalizedCountry,
            numericAmount,
            currency,
            numericProductId,
          ]
        );

      if (
        catalogResult.rows.length ===
        0
      ) {
        return res.status(400).json({
          error:
            "Product is not configured for this country and amount",
        });
      }

      const catalogProduct =
        catalogResult.rows[0];

      /*
       * ================================
       * 4. GET ADMIN SETTINGS
       * ================================
       */

      const settingsResult =
        await pool.query(
          `
          SELECT
            fee_percent,
            bonus_percent,
            fixed_fee_cents
          FROM app_settings
          WHERE id = 1
          LIMIT 1
          `
        );

      if (
        settingsResult.rows.length ===
        0
      ) {
        return res.status(500).json({
          error:
            "Admin settings are not configured",
        });
      }

      const settings =
        settingsResult.rows[0];

      const feePercent =
        Number(
          settings.fee_percent
        );

      const bonusPercent =
        Number(
          settings.bonus_percent
        );

      const fixedFeeCents =
        Number(
          settings.fixed_fee_cents
        );

      if (
        !Number.isFinite(
          feePercent
        ) ||
        !Number.isFinite(
          bonusPercent
        ) ||
        !Number.isInteger(
          fixedFeeCents
        )
      ) {
        return res.status(500).json({
          error:
            "Invalid admin settings",
        });
      }

      /*
       * ================================
       * 5. CALCULATE FINAL CUSTOMER PRICE
       * ================================
       *
       * Product price
       * + percentage fee
       * + fixed fee
       *
       * Bonus is NOT added to
       * the customer's Stripe charge.
       */

      const percentageFeeCents =
        Math.round(
          basePriceCents *
            (
              feePercent /
              100
            )
        );

      const finalChargeCents =
        basePriceCents +
        percentageFeeCents +
        fixedFeeCents;

      if (
        !Number.isInteger(
          finalChargeCents
        ) ||
        finalChargeCents < 1
      ) {
        return res.status(500).json({
          error:
            "Invalid final charge",
        });
      }

      /*
       * ================================
       * 6. CREATE UNIQUE ORDER ID
       * ================================
       */

      const orderId =
        `PGNT-${Date.now()}-${crypto
          .randomBytes(5)
          .toString("hex")
          .toUpperCase()}`;

      /*
       * ================================
       * 7. SAVE ORDER BEFORE STRIPE
       * ================================
       *
       * This gives us a database record
       * before creating the payment.
       */

      await pool.query(
        `
        INSERT INTO orders (
          order_id,
          country,
          phone,
          amount,
          product_id,
          currency,
          charge_cents,
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
          'pending'
        )
        `,
        [
          orderId,
          normalizedCountry,
          normalizedPhone,
          numericAmount,
          numericProductId,
          currency,
          finalChargeCents,
        ]
      );

      /*
       * ================================
       * 8. CREATE STRIPE CHECKOUT
       * ================================
       */

      let session;

      try {
        session =
          await stripe.checkout.sessions.create(
            {
              mode:
                "payment",

              payment_method_types: [
                "card",
              ],

              line_items: [
                {
                  price_data: {
                    currency:
                      currency,

                    product_data: {
                      name:
                        `PGNT ASIAN TOPUP - ${normalizedCountry}`,

                      description:
                        `${catalogProduct.operator} / ${numericAmount}`,
                    },

                    unit_amount:
                      finalChargeCents,
                  },

                  quantity: 1,
                },
              ],

              metadata: {
                orderId:
                  orderId,

                productId:
                  String(
                    numericProductId
                  ),

                country:
                  normalizedCountry,

                phone:
                  normalizedPhone,

                amount:
                  String(
                    numericAmount
                  ),

                basePriceCents:
                  String(
                    basePriceCents
                  ),

                feePercent:
                  String(
                    feePercent
                  ),

                bonusPercent:
                  String(
                    bonusPercent
                  ),

                fixedFeeCents:
                  String(
                    fixedFeeCents
                  ),

                finalChargeCents:
                  String(
                    finalChargeCents
                  ),
              },

              success_url:
                `${process.env.APP_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,

              cancel_url:
                `${process.env.APP_BASE_URL}/payment-cancelled`,
            }
          );
      } catch (stripeError) {
        /*
         * Stripe failed.
         * Mark the order as failed.
         */

        await pool.query(
          `
          UPDATE orders
          SET
            status = 'failed',
            error_message = $1,
            updated_at = NOW()
          WHERE order_id = $2
          `,
          [
            String(
              stripeError.message ||
                "Stripe Checkout creation failed"
            ),

            orderId,
          ]
        );

        throw stripeError;
      }

      /*
       * ================================
       * 9. SAVE STRIPE SESSION ID
       * ================================
       */

      await pool.query(
        `
        UPDATE orders
        SET
          stripe_session_id = $1,
          updated_at = NOW()
        WHERE order_id = $2
        `,
        [
          session.id,
          orderId,
        ]
      );

      /*
       * ================================
       * 10. RETURN CHECKOUT INFORMATION
       * ================================
       */

      return res.json({
        success: true,

        orderId:
          orderId,

        checkoutSessionId:
          session.id,

        checkoutUrl:
          session.url,

        currency:
          currency,

        basePriceCents:
          basePriceCents,

        feePercent:
          feePercent,

        percentageFeeCents:
          percentageFeeCents,

        fixedFeeCents:
          fixedFeeCents,

        bonusPercent:
          bonusPercent,

        finalChargeCents:
          finalChargeCents,
      });
    } catch (err) {
      console.error(
        "Stripe checkout error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to create Stripe Checkout",
      });
    }
  }
);
/*
 * ================================
 * ERROR HANDLER
 * ================================
 */

app.use(
  (err, _req, res, _next) => {
    console.error(
      "Unhandled server error:",
      err
    );

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      error:
        "Internal server error",
    });
  }
);

/*
 * ================================
 * START SERVER
 * ================================
 */

async function startServer() {
  try {
    await initDatabase();

    app.listen(
      port,
      "0.0.0.0",
      () => {
        console.log(
          `PGNT ASIAN backend running on port ${port}`
        );
      }
    );
  } catch (err) {
    console.error(
      "Failed to start server:",
      err
    );

    process.exit(1);
  }
}

startServer();
              
