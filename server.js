import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import crypto from "crypto";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const app = express();

const port = Number(
  process.env.PORT || 4242
);

/*
 * ================================
 * STRIPE
 * ================================
 */

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY ||
    "sk_test_placeholder"
);

/*
 * ================================
 * POSTGRESQL
 * ================================
 */

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl:
    process.env.DATABASE_URL
      ? {
          rejectUnauthorized: false,
        }
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

const allowedOrigins =
  String(
    process.env.ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);

app.use(
  cors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : true,
  })
);

/*
 * ================================
 * ADMIN SECURITY
 * ================================
 */

function requireAdmin(
  req,
  res,
  next
) {
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
    typeof providedKey !==
      "string" ||
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
        Buffer.from(
          providedKey
        ),
        Buffer.from(
          configuredKey
        )
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

  console.log(
    "Initializing PostgreSQL..."
  );

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

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      paid_at TIMESTAMPTZ,

      completed_at TIMESTAMPTZ,

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    );
  `);

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

  console.log(
    "Orders table ready."
  );
	  }
/*
 * ================================
 * APP SETTINGS
 * ================================
 *
 * Admin controls:
 * - Fee percentage
 * - Bonus percentage
 * - Fixed fee
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

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
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

      price_cents INTEGER
        NOT NULL DEFAULT 0,

      currency TEXT
        NOT NULL DEFAULT 'eur',

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    );
  `);

/*
 * ================================
 * PRODUCT CATALOG
 * ================================
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

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

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
    ON product_catalog (
      country,
      amount,
      currency,
      active
    );
  `);

  console.log(
    "Settings and catalog tables ready."
  );
/*
 * ================================
 * STRIPE WEBHOOK
 * ================================
 *
 * IMPORTANT:
 * This route MUST come before
 * express.json().
 */

app.post(
  "/api/stripe/webhook",

  express.raw({
    type: "application/json",
  }),

  async (req, res) => {
    const signature =
      req.headers["stripe-signature"];

    let event;

    /*
     * Verify Stripe signature
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
     * Process Stripe event
     */

    try {
      if (
        event.type ===
        "checkout.session.completed"
      ) {
        const session =
          event.data.object;

        console.log(
          "STRIPE CHECKOUT COMPLETED:",
          session.id
        );

        /*
         * Payment must be completed
         */

        if (
          session.payment_status !==
          "paid"
        ) {
          return res.json({
            received: true,
            processed: false,
            reason:
              "payment_not_paid",
          });
        }

        /*
         * Verify and process order.
         */

        const verifiedOrder =
          await processPaidOrder(
            session
          );

        /*
         * Fulfill only once.
         */

        if (
          verifiedOrder &&
          !verifiedOrder.alreadyProcessed
        ) {
          await fulfillPaidOrder(
            verifiedOrder
          );
        } else {
          console.log(
            "Order already processed:",
            session.id
          );
        }
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
 * NORMAL JSON
 * ================================
 *
 * This MUST stay AFTER
 * the Stripe webhook.
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
          "Database health error:",
          err.message
        );

        database =
          "error";
      }
    }

    const required = [
      "DATABASE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "DTONE_API_KEY",
      "DTONE_API_SECRET",
      "DTONE_CALLBACK_TOKEN",
      "APP_BASE_URL",
      "ADMIN_API_KEY",
    ];

    const missing =
      required.filter(
        (key) =>
          !process.env[key]
      );

    return res.json({
      ok:
        missing.length === 0 &&
        database === "connected",

      service:
        "pgnt-asian-backend",

      database,

      missing_env:
        missing,
    });
  }
);
/*
 * ================================
 * PROCESS PAID ORDER
 * ================================
 */

async function processPaidOrder(
  session
) {
  if (!process.env.DATABASE_URL) {
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
      "Invalid productId"
    );
  }

  if (
    !country ||
    !phone
  ) {
    throw new Error(
      "Country or phone is missing"
    );
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid amount"
    );
  }

  if (
    !Number.isInteger(
      finalChargeCents
    ) ||
    finalChargeCents < 1
  ) {
    throw new Error(
      "Invalid finalChargeCents"
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
   * Verify saved charge.
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
    ).trim() !== country
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
    ).trim() !== phone
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
    console.log(
      "Order already changed:",
      orderId
    );

    return {
      alreadyProcessed:
        true,

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
 * FULFILL PAID ORDER
 * ================================
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
   * Already completed.
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

  /*
   * Already processing.
   */

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
   * Change paid -> processing.
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
   * Another process may
   * have started fulfillment.
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
   * Required configuration.
   */

  if (
    !process.env.APP_BASE_URL
  ) {
    throw new Error(
      "APP_BASE_URL is not configured"
    );
  }

  if (
    !process.env.DTONE_CALLBACK_TOKEN
  ) {
    throw new Error(
      "DTONE_CALLBACK_TOKEN is not configured"
    );
  }

  /*
   * DT One callback URL.
   */

  const callbackUrl =
    `${process.env.APP_BASE_URL}` +
    `/api/dtone/callback` +
    `?token=${encodeURIComponent(
      process.env.DTONE_CALLBACK_TOKEN
    )}`;

  try {
    /*
     * Send top-up to DT One.
     */

    const dtoneResult =
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
     * Read DT One transaction ID.
     */

    const transactionId =
      dtoneResult?.id ||
      dtoneResult?.transaction_id ||
      dtoneResult?.transactionId ||
      null;

    /*
     * Read DT One status.
     */

    const dtoneStatus =
      dtoneResult?.status ||
      "processing";

    /*
     * Save DT One information.
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

          dtone_status =
            $2,

          updated_at =
            NOW()

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

          String(
            dtoneStatus
          ),

          paidOrder.order_id,
        ]
      );

    console.log(
      "DT ONE TOP-UP CREATED:",
      update.rows[0]
    );

    return {
      success: true,

      order:
        update.rows[0],

      dtone:
        dtoneResult,
    };
  } catch (err) {
    /*
     * DT One request failed.
     */

    console.error(
      "DT One fulfillment error:",
      err
    );

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

    throw err;
  }
	    }
/*
 * ================================
 * DT ONE CALLBACK
 * ================================
 *
 * DT One sends the final transaction
 * status to this endpoint.
 */

const successStatuses =
  new Set([
    "COMPLETED",
    "SUCCESS",
    "SUCCEEDED",
  ]);

const failedStatuses =
  new Set([
    "FAILED",
    "FAILURE",
    "REJECTED",
    "CANCELLED",
    "CANCELED",
  ]);

app.post(
  "/api/dtone/callback",
  async (req, res) => {
    try {
      /*
       * ================================
       * 1. VERIFY CALLBACK TOKEN
       * ================================
       */

      const configuredToken =
        String(
          process.env.DTONE_CALLBACK_TOKEN ||
            ""
        ).trim();

      const receivedToken =
        String(
          req.query.token || ""
        ).trim();

      if (
        !configuredToken ||
        !receivedToken
      ) {
        return res.status(401).json({
          error:
            "Unauthorized",
        });
      }

      if (
        receivedToken.length !==
        configuredToken.length
      ) {
        return res.status(401).json({
          error:
            "Unauthorized",
        });
      }

      const valid =
        crypto.timingSafeEqual(
          Buffer.from(
            receivedToken
          ),
          Buffer.from(
            configuredToken
          )
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Unauthorized",
        });
      }

      /*
       * ================================
       * 2. READ DT ONE DATA
       * ================================
       */

      const body =
        req.body || {};

      const externalId =
        String(
          body.external_id ||
            body.externalId ||
            ""
        ).trim();

      const transactionId =
        body.id ||
        body.transaction_id ||
        body.transactionId ||
        null;

      const status =
        String(
          body.status || ""
        )
          .trim()
          .toUpperCase();

      if (!externalId) {
        return res.status(400).json({
          error:
            "external_id is required",
        });
      }

      /*
       * ================================
       * 3. FIND ORDER
       * ================================
       */

      const result =
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
          [externalId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Order not found",
        });
      }

      const order =
        result.rows[0];

      /*
       * ================================
       * 4. ALREADY COMPLETED
       * ================================
       */

      if (
        order.status ===
        "completed"
      ) {
        return res.json({
          received: true,

          alreadyCompleted:
            true,

          orderId:
            order.order_id,
        });
      }

      /*
       * ================================
       * 5. SUCCESS
       * ================================
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

              updated_at =
                NOW()

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
       * ================================
       * 6. FAILED
       * ================================
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

              updated_at =
                NOW()

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
       * ================================
       * 7. PENDING / PROCESSING
       * ================================
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

            updated_at =
              NOW()

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
 * DT ONE CALLBACK
 * ================================
 */

app.post(
  "/api/dtone/callback",
  async (req, res) => {
    try {
      /*
       * Verify callback token.
       */

      const token = String(
        req.query.token || ""
      ).trim();

      const configuredToken = String(
        process.env.DTONE_CALLBACK_TOKEN || ""
      ).trim();

      if (
        !configuredToken ||
        !token ||
        token !== configuredToken
      ) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      const body = req.body || {};

      /*
       * DT One transaction information.
       */

      const transactionId =
        body.id ||
        body.transaction_id ||
        body.transactionId ||
        null;

      const externalId =
        body.external_id ||
        body.externalId ||
        body.reference ||
        null;

      const status = String(
        body.status ||
          body.transaction_status ||
          ""
      )
        .trim()
        .toLowerCase();

      /*
       * We need our PGNT order ID.
       */

      const orderId = String(
        externalId || ""
      ).trim();

      if (!orderId) {
        return res.status(400).json({
          error:
            "DT One external_id/order_id is missing",
        });
      }

      /*
       * Find order.
       */

      const result = await pool.query(
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
        [orderId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      const order = result.rows[0];

      /*
       * Already completed.
       */

      if (
        order.status === "completed"
      ) {
        return res.json({
          received: true,
          alreadyCompleted: true,
          orderId,
        });
      }

      /*
       * Successful DT One statuses.
       */

      const successStatuses = new Set([
        "completed",
        "successful",
        "success",
        "succeeded",
      ]);

      /*
       * Failed DT One statuses.
       */

      const failedStatuses = new Set([
        "failed",
        "failure",
        "rejected",
        "cancelled",
        "canceled",
      ]);

      /*
       * ================================
       * COMPLETED
       * ================================
       */

      if (
        successStatuses.has(status)
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
                ? String(transactionId)
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
          order: update.rows[0],
        });
      }

      /*
       * ================================
       * FAILED
       * ================================
       */

      if (
        failedStatuses.has(status)
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
                ? String(transactionId)
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
          order: update.rows[0],
        });
      }

      /*
       * ================================
       * PENDING / PROCESSING
       * ================================
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
              ? String(transactionId)
              : null,

            status || "unknown",

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
        order: update.rows[0],
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
 * ORDER STATUS
 * ================================
 */

app.get(
  "/api/orders/:orderId",
  async (req, res) => {
    try {
      const orderId = String(
        req.params.orderId || ""
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
        order: result.rows[0],
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
