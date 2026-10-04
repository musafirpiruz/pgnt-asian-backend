import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import crypto from "crypto";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const app = express();

const PORT = Number(process.env.PORT || 4242);

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

const DTONE_API_BASE_URL =
  process.env.DTONE_API_BASE_URL ||
  "https://preprod-dvs-api.dtone.com/v1";

/*
============================================================
HELPERS
============================================================
*/

function env(name) {
  return String(process.env[name] || "").trim();
}

function requireEnv(name) {
  const value = env(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function makeOrderId() {
  return (
    "PGNT-" +
    Date.now() +
    "-" +
    crypto.randomBytes(5).toString("hex")
  );
}

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function adminAuthorized(req) {
  const configured = env("ADMIN_API_KEY");
  const provided = req.headers["x-admin-key"];

  if (!configured || typeof provided !== "string") {
    return false;
  }

  if (configured.length !== provided.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(configured),
      Buffer.from(provided)
    );
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!adminAuthorized(req)) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
}

function dtoneAuth() {
  const key = requireEnv("DTONE_API_KEY");
  const secret = requireEnv("DTONE_API_SECRET");

  return (
    "Basic " +
    Buffer.from(`${key}:${secret}`).toString("base64")
  );
}

function getDtoneCallbackUrl() {
  const base = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
  const token = requireEnv("DTONE_CALLBACK_TOKEN");

  return (
    `${base}/api/dtone/callback` +
    `?token=${encodeURIComponent(token)}`
  );
}

function getDtoneStatus(transaction) {
  return String(
    transaction?.status?.message ||
      transaction?.status_message ||
      transaction?.status ||
      ""
  )
    .trim()
    .toUpperCase();
}

function getDtoneTransactionId(transaction) {
  return (
    transaction?.id ||
    transaction?.transaction_id ||
    transaction?.transactionId ||
    null
  );
}

/*
============================================================
CORS
============================================================
*/

const allowedOrigins = String(
  process.env.ALLOWED_ORIGINS || ""
)
  .split(",")
  .map((x) => x.trim())
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
============================================================
STRIPE WEBHOOK
IMPORTANT:
THIS MUST COME BEFORE express.json()
============================================================
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

    try {
      event =
        stripe.webhooks.constructEvent(
          req.body,
          signature,
          requireEnv(
            "STRIPE_WEBHOOK_SECRET"
          )
        );
    } catch (error) {
      console.error(
        "Stripe webhook verification error:",
        error.message
      );

      return res.status(400).send(
        `Webhook Error: ${error.message}`
      );
    }

    try {
      if (
        event.type ===
        "checkout.session.completed"
      ) {
        const session =
          event.data.object;

        if (
          session.payment_status !==
          "paid"
        ) {
          console.log(
            "Payment not paid:",
            session.id
          );

          return res.json({
            received: true,
          });
        }

        await processPaidOrder(
          session
        );
      }

      return res.json({
        received: true,
      });
    } catch (error) {
      console.error(
        "Webhook processing error:",
        error
      );

      return res.status(500).json({
        error:
          "Webhook processing failed",
      });
    }
  }
);

/*
============================================================
NORMAL JSON
============================================================
*/

app.use(
  express.json({
    limit: "100kb",
  })
);

/*
============================================================
DATABASE INITIALIZATION
============================================================
*/

async function initDatabase() {
  if (!env("DATABASE_URL")) {
    console.warn(
      "DATABASE_URL is not configured"
    );

    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,

      order_id TEXT UNIQUE NOT NULL,

      stripe_session_id TEXT UNIQUE,

      stripe_payment_intent_id TEXT,

      country TEXT NOT NULL,

      phone TEXT NOT NULL,

      operator TEXT NOT NULL
        DEFAULT 'Auto Detect',

      amount NUMERIC NOT NULL,

      product_id BIGINT NOT NULL,

      currency TEXT NOT NULL
        DEFAULT 'eur',

      product_price_cents INTEGER
        NOT NULL DEFAULT 0,

      fee_cents INTEGER
        NOT NULL DEFAULT 0,

      bonus_amount NUMERIC
        NOT NULL DEFAULT 0,

      charge_cents INTEGER
        NOT NULL,

      status TEXT NOT NULL
        DEFAULT 'pending',

      dtone_transaction_id TEXT UNIQUE,

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
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS
        stripe_payment_intent_id TEXT;

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS
        operator TEXT
        NOT NULL DEFAULT 'Auto Detect';

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS
        product_price_cents INTEGER
        NOT NULL DEFAULT 0;

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS
        fee_cents INTEGER
        NOT NULL DEFAULT 0;

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS
        bonus_amount NUMERIC
        NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
      idx_orders_status
    ON orders(status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
      idx_orders_created
    ON orders(created_at DESC);
  `);

  /*
  APP SETTINGS
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
  PRODUCT CATALOG
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

  /*
  PRODUCT PRICES
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

  console.log(
    "Database initialization complete."
  );
}

/*
============================================================
HEALTH
============================================================
*/

app.get(
  "/health",
  async (_req, res) => {
    let database =
      "not_configured";

    if (env("DATABASE_URL")) {
      try {
        await pool.query(
          "SELECT 1"
        );

        database =
          "connected";
      } catch (error) {
        console.error(
          "Database error:",
          error.message
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
          !env(key)
      );

    res.json({
      ok:
        database ===
          "connected" &&
        missing.length ===
          0,

      service:
        "pgnt-asian-backend",

      database,

      missing_env:
        missing,
    });
  }
);

/*
============================================================
SETTINGS
============================================================
*/

async function getSettings() {
  const result =
    await pool.query(`
      SELECT
        fee_percent,
        bonus_percent,
        fixed_fee_cents
      FROM app_settings
      WHERE id = 1
      LIMIT 1
    `);

  if (
    result.rows.length === 0
  ) {
    throw new Error(
      "App settings not found"
    );
  }

  return result.rows[0];
}

/*
============================================================
ADMIN SETTINGS
============================================================
*/

app.get(
  "/api/admin/settings",
  requireAdmin,
  async (_req, res) => {
    try {
      const settings =
        await getSettings();

      res.json({
        settings,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

app.put(
  "/api/admin/settings",
  requireAdmin,
  async (req, res) => {
    try {
      const feePercent =
        Number(
          req.body.feePercent
        );

      const bonusPercent =
        Number(
          req.body.bonusPercent
        );

      const fixedFeeCents =
        Number(
          req.body.fixedFeeCents
        );

      if (
        !Number.isFinite(
          feePercent
        ) ||
        feePercent < 0 ||
        feePercent > 100
      ) {
        return res.status(400).json({
          error:
            "Invalid feePercent",
        });
      }

      if (
        !Number.isFinite(
          bonusPercent
        ) ||
        bonusPercent < 0 ||
        bonusPercent > 100
      ) {
        return res.status(400).json({
          error:
            "Invalid bonusPercent",
        });
      }

      if (
        !Number.isInteger(
          fixedFeeCents
        ) ||
        fixedFeeCents < 0
      ) {
        return res.status(400).json({
          error:
            "Invalid fixedFeeCents",
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
          RETURNING *
          `,
          [
            feePercent,
            bonusPercent,
            fixedFeeCents,
          ]
        );

      res.json({
        settings:
          result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/*
============================================================
ADMIN PRODUCT
============================================================
*/

app.post(
  "/api/admin/products",
  requireAdmin,
  async (req, res) => {
    try {
      const country =
        String(
          req.body.country ||
            ""
        ).trim();

      const amount =
        Number(
          req.body.amount
        );

      const currency =
        String(
          req.body.currency ||
            "eur"
        ).toLowerCase();

      const productId =
        Number(
          req.body.productId
        );

      const operator =
        String(
          req.body.operator ||
            "Auto Detect"
        ).trim();

      const priceCents =
        Number(
          req.body.priceCents
        );

      const active =
        req.body.active ===
        undefined
          ? true
          : Boolean(
              req.body.active
            );

      if (
        !country ||
        !Number.isFinite(
          amount
        ) ||
        amount <= 0 ||
        !Number.isInteger(
          productId
        ) ||
        productId <= 0 ||
        !Number.isInteger(
          priceCents
        ) ||
        priceCents <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid product data",
        });
      }

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
        ON CONFLICT (product_id)
        DO UPDATE SET
          price_cents =
            EXCLUDED.price_cents,
          currency =
            EXCLUDED.currency,
          updated_at =
            NOW()
        `,
        [
          productId,
          priceCents,
          currency,
        ]
      );

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
          RETURNING *
          `,
          [
            country,
            amount,
            currency,
            productId,
            operator,
            active,
          ]
        );

      res.json({
        success: true,
        product:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "Product error:",
        error
      );

      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/*
============================================================
PUBLIC CATALOG
============================================================
*/

app.get(
  "/api/catalog",
  async (req, res) => {
    try {
      const country =
        req.query.country
          ? String(
              req.query.country
            )
          : null;

      const currency =
        req.query.currency
          ? String(
              req.query.currency
            ).toLowerCase()
          : null;

      const result =
        await pool.query(
          `
          SELECT
            c.country,
            c.amount,
            c.currency,
            c.product_id,
            c.operator,
            c.active,
            p.price_cents
          FROM product_catalog c
          LEFT JOIN product_prices p
            ON p.product_id =
              c.product_id
          WHERE
            ($1::text IS NULL
              OR c.country = $1)
            AND
            ($2::text IS NULL
              OR c.currency = $2)
          ORDER BY
            c.country,
            c.amount
          `,
          [
            country,
            currency,
          ]
        );

      res.json({
        products:
          result.rows,
      });
    } catch (error) {
      res.status(500).json({
        error:
          "Unable to load catalog",
      });
    }
  }
);

/*
============================================================
CREATE STRIPE CHECKOUT
PRICE IS READ FROM DATABASE
============================================================
*/

app.post(
  "/api/payments/checkout",
  async (req, res) => {
    try {
      const country =
        String(
          req.body.country ||
            ""
        ).trim();

      const operator =
        String(
          req.body.operator ||
            "Auto Detect"
        ).trim();

      const phone =
        normalizePhone(
          req.body.phone
        );

      const amount =
        Number(
          req.body.amount
        );

      const currency =
        String(
          req.body.currency ||
            "eur"
        ).toLowerCase();

      const productId =
        Number(
          req.body.productId ||
            0
        );

      if (
        !country ||
        !phone ||
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid checkout data",
        });
      }

      if (
        ![
          "eur",
          "usd",
          "gbp",
        ].includes(
          currency
        )
      ) {
        return res.status(400).json({
          error:
            "Unsupported currency",
        });
      }

      let product;

      if (
        Number.isInteger(
          productId
        ) &&
        productId > 0
      ) {
        const result =
          await pool.query(
            `
            SELECT
              c.*,
              p.price_cents
            FROM product_catalog c
            JOIN product_prices p
              ON p.product_id =
                c.product_id
            WHERE
              c.product_id = $1
              AND c.active = TRUE
            LIMIT 1
            `,
            [
              productId,
            ]
          );

        product =
          result.rows[0];
      } else {
        const result =
          await pool.query(
            `
            SELECT
              c.*,
              p.price_cents
            FROM product_catalog c
            JOIN product_prices p
              ON p.product_id =
                c.product_id
            WHERE
              c.country = $1
              AND c.amount = $2
              AND c.currency = $3
              AND c.operator = $4
              AND c.active = TRUE
            LIMIT 1
            `,
            [
              country,
              amount,
              currency,
              operator,
            ]
          );

        product =
          result.rows[0];
      }

      if (!product) {
        return res.status(400).json({
          error:
            "Product is not configured by admin",
        });
      }

      const settings =
        await getSettings();

      const productPriceCents =
        Number(
          product.price_cents
        );

      const feePercent =
        Number(
          settings.fee_percent
        );

      const fixedFeeCents =
        Number(
          settings.fixed_fee_cents
        );

      const feeCents =
        Math.round(
          productPriceCents *
            (feePercent /
              100)
        ) +
        fixedFeeCents;

      const totalCents =
        productPriceCents +
        feeCents;

      const bonusAmount =
        amount *
        (Number(
          settings.bonus_percent
        ) /
          100);

      const orderId =
        makeOrderId();

      await pool.query(
        `
        INSERT INTO orders (
          order_id,
          country,
          phone,
          operator,
          amount,
          product_id,
          currency,
          product_price_cents,
          fee_cents,
          bonus_amount,
          charge_cents,
          status
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,
          'pending'
        )
        `,
        [
          orderId,
          country,
          phone,
          operator,
          amount,
          product.product_id,
          currency,
          productPriceCents,
          feeCents,
          bonusAmount,
          totalCents,
        ]
      );

      const session =
        await stripe.checkout.sessions.create(
          {
            mode:
              "payment",

            line_items: [
              {
                price_data: {
                  currency:
                    currency,

                  product_data: {
                    name:
                      `PGNT ASIAN TOPUP - ` +
                      `${country} ${amount}`,
                  },

                  unit_amount:
                    totalCents,
                },

                quantity: 1,
              },
            ],

            metadata: {
              orderId:
                orderId,

              productId:
                String(
                  product.product_id
                ),

              country:
                country,

              operator:
                operator,

              phone:
                phone,

              amount:
                String(
                  amount
                ),

              finalChargeCents:
                String(
                  totalCents
                ),
            },

            success_url:
              `${requireEnv(
                "APP_BASE_URL"
              )}/payment-success` +
              `?session_id={` +
              `CHECKOUT_SESSION_ID}`,

            cancel_url:
              `${requireEnv(
                "APP_BASE_URL"
              )}/payment-cancelled`,
          }
        );

      await pool.query(
        `
        UPDATE orders
        SET
          stripe_session_id =
            $1,

          stripe_payment_intent_id =
            $2,

          updated_at =
            NOW()

        WHERE order_id =
          $3
        `,
        [
          session.id,

          session.payment_intent
            ? String(
                session.payment_intent
              )
            : null,

          orderId,
        ]
      );

      res.json({
        success: true,

        orderId:
          orderId,

        checkoutUrl:
          session.url,

        sessionId:
          session.id,

        currency:
          currency,

        productPriceCents:
          productPriceCents,

        feeCents:
          feeCents,

        totalCents:
          totalCents,

        bonusAmount:
          bonusAmount,
      });
    } catch (error) {
      console.error(
        "Checkout error:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Checkout failed",
      });
    }
  }
);

/*
============================================================
PROCESS PAID STRIPE ORDER
============================================================
*/

async function processPaidOrder(
  session
) {
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
      "Payment is not paid"
    );
  }

  const metadata =
    session.metadata ||
    {};

  const orderId =
    String(
      metadata.orderId ||
        ""
    ).trim();

  if (!orderId) {
    throw new Error(
      "Missing orderId"
    );
  }

  const result =
    await pool.query(
      `
      SELECT *
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      `,
      [
        orderId,
      ]
    );

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
  Duplicate protection.
  */

  if (
    order.status ===
      "completed" ||
    order.status ===
      "processing"
  ) {
    return order;
  }

  /*
  Verify amount.
  */

  if (
    Number(
      session.amount_total
    ) !==
    Number(
      order.charge_cents
    )
  ) {
    throw new Error(
      "Stripe amount does not match order"
    );
  }

  /*
  Save paid state.
  */

  const updated =
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

        stripe_payment_intent_id =
          COALESCE(
            $1,
            stripe_payment_intent_id
          ),

        updated_at =
          NOW()

      WHERE order_id = $2

      RETURNING *
      `,
      [
        session.payment_intent
          ? String(
              session.payment_intent
            )
          : null,

        orderId,
      ]
    );

  const paidOrder =
    updated.rows[0];

  console.log(
    "STRIPE PAYMENT VERIFIED:",
    orderId
  );

  /*
  VERY IMPORTANT:
  Now send only the verified paid
  order to DT One.
  */

  await fulfillPaidOrder(
    paidOrder
  );

  return paidOrder;
}

/*
============================================================
DT ONE CREATE TRANSACTION
============================================================
*/

async function createDtoneTopup(
  order
) {
  const response =
    await fetch(
      `${DTONE_API_BASE_URL}` +
      `/async/transactions`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            dtoneAuth(),

          Accept:
            "application/json",

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            external_id:
              String(
                order.order_id
              ),

            product_id:
              Number(
                order.product_id
              ),

            auto_confirm:
              true,

            credit_party_identifier:
              {
                mobile_number:
                  String(
                    order.phone
                  ),
              },

            callback_url:
              getDtoneCallbackUrl(),
          }),
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        text
      );
  } catch {
    data = {
      raw: text,
    };
  }

  if (
    !response.ok
  ) {
    const error =
      new Error(
        `DT One API error: ${response.status}`
      );

    error.response =
      data;

    throw error;
  }

  return data;
}

/*
============================================================
FULFILL PAID ORDER
============================================================
*/

async function fulfillPaidOrder(
  order
) {
  /*
  Atomic lock:
  only one process can change
  paid -> processing.
  */

  const locked =
    await pool.query(
      `
      UPDATE orders
      SET
        status =
          'processing',

        updated_at =
          NOW()

      WHERE order_id =
        $1

        AND status =
          'paid'

        AND dtone_transaction_id
          IS NULL

      RETURNING *
      `,
      [
        order.order_id,
      ]
    );

  if (
    locked.rows.length ===
    0
  ) {
    return;
  }

  const processingOrder =
    locked.rows[0];

  try {
    const dtone =
      await createDtoneTopup(
        processingOrder
      );

    const transactionId =
      getDtoneTransactionId(
        dtone
      );

    const status =
      getDtoneStatus(
        dtone
      ) ||
      "SUBMITTED";

    let finalStatus =
      "processing";

    if (
      status ===
      "COMPLETED"
    ) {
      finalStatus =
        "completed";
    }

    if (
      [
        "REJECTED",
        "DECLINED",
        "CANCELLED",
        "CANCELED",
      ].includes(
        status
      )
    ) {
      finalStatus =
        "failed";
    }

    const result =
      await pool.query(
        `
        UPDATE orders
        SET
          dtone_transaction_id =
            $1,

          dtone_status =
            $2,

          status =
            $3,

          completed_at =
            CASE
              WHEN $3 =
                'completed'
              THEN
                COALESCE(
                  completed_at,
                  NOW()
                )
              ELSE
                completed_at
            END,

          updated_at =
            NOW()

        WHERE order_id =
          $4

        RETURNING *
        `,
        [
          transactionId
            ? String(
                transactionId
              )
            : null,

          status,

          finalStatus,

          processingOrder.order_id,
        ]
      );

    console.log(
      "DT ONE TOPUP CREATED:",
      {
        orderId:
          processingOrder.order_id,

        transactionId:
          transactionId,

        status:
          status,
      }
    );

    /*
    If DT One immediately returns
    a final failed state, refund.
    */

    if (
      finalStatus ===
      "failed"
    ) {
      await refundOrder(
        processingOrder.order_id,
        "DT One rejected the transaction"
      );
    }

    return result.rows[0];
  } catch (error) {
    console.error(
      "DT One fulfillment error:",
      error
    );

    await pool.query(
      `
      UPDATE orders
      SET
        status =
          'failed',

        error_message =
          $1,

        updated_at =
          NOW()

      WHERE order_id =
        $2
      `,
      [
        String(
          error.message ||
            "DT One error"
        ),

        processingOrder.order_id,
      ]
    );

    /*
    Payment succeeded but
    DT One request failed.
    Try automatic Stripe refund.
    */

    try {
      await refundOrder(
        processingOrder.order_id,
        "DT One fulfillment failed"
      );
    } catch (
      refundError
    ) {
      console.error(
        "Refund failed:",
        refundError
      );
    }

    throw error;
  }
}

/*
============================================================
DT ONE CALLBACK
============================================================
*/

app.post(
  "/api/dtone/callback",
  async (req, res) => {
    try {
      const configuredToken =
        env(
          "DTONE_CALLBACK_TOKEN"
        );

      const receivedToken =
        String(
          req.query.token ||
            ""
        ).trim();

      if (
        !configuredToken ||
        receivedToken !==
          configuredToken
      ) {
        return res.status(401).json({
          error:
            "Unauthorized",
        });
      }

      const transaction =
        req.body ||
        {};

      const externalId =
        String(
          transaction.external_id ||
            transaction.externalId ||
            ""
        ).trim();

      const transactionId =
        getDtoneTransactionId(
          transaction
        );

      const status =
        getDtoneStatus(
          transaction
        );

      if (
        !externalId &&
        !transactionId
      ) {
        return res.status(400).json({
          error:
            "Missing transaction ID",
        });
      }

      let result;

      if (
        externalId
      ) {
        result =
          await pool.query(
            `
            SELECT *
            FROM orders
            WHERE order_id =
              $1
            LIMIT 1
            `,
            [
              externalId,
            ]
          );
      } else {
        result =
          await pool.query(
            `
            SELECT *
            FROM orders
            WHERE dtone_transaction_id =
              $1
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
        result.rows.length ===
        0
      ) {
        console.error(
          "DT One order not found:",
          externalId,
          transactionId
        );

        /*
        We acknowledge receipt so
        DT One does not keep retrying
        an unknown order forever.
        */

        return res.json({
          received: true,
          matched: false,
        });
      }

      const order =
        result.rows[0];

      /*
      Final success
      */

      if (
        status ===
        "COMPLETED"
      ) {
        const updated =
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

              status =
                'completed',

              completed_at =
                COALESCE(
                  completed_at,
                  NOW()
                ),

              error_message =
                NULL,

              updated_at =
                NOW()

            WHERE order_id =
              $3

            RETURNING *
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
          "DT ONE COMPLETED:",
          order.order_id
        );

        return res.json({
          received: true,

          status:
            updated.rows[0]
              .status,

          orderId:
            order.order_id,
        });
      }

      /*
      Final failure
      */

      if (
        [
          "REJECTED",
          "DECLINED",
          "CANCELLED",
          "CANCELED",
        ].includes(
          status
        )
      ) {
        const errorMessage =
          String(
            transaction?.error?.message ||
              transaction?.error_message ||
              `DT One status: ${status}`
          );

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

            status =
              'failed',

            error_message =
              $3,

            updated_at =
              NOW()

          WHERE order_id =
            $4
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

        /*
        Automatically refund the
        verified Stripe payment.
        */

        try {
          await refundOrder(
            order.order_id,
            errorMessage
          );
        } catch (
          refundError
        ) {
          console.error(
            "Automatic refund error:",
            refundError
          );
        }

        console.log(
          "DT ONE FAILED:",
          order.order_id,
          status
        );

        return res.json({
          received: true,

          status:
            "failed",

          orderId:
            order.order_id,
        });
      }

      /*
      Intermediate status:
      keep order processing.
      */

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

          status =
            'processing',

          updated_at =
            NOW()

        WHERE order_id =
          $3
        `,
        [
          transactionId
            ? String(
                transactionId
              )
            : null,

          status ||
            "PROCESSING",

          order.order_id,
        ]
      );

      return res.json({
        received: true,

        status:
          status ||
          "PROCESSING",

        orderId:
          order.order_id,
      });
    } catch (error) {
      console.error(
        "DT One callback error:",
        error
      );

      return res.status(500).json({
        error:
          "Callback processing failed",
      });
    }
  }
);

/*
============================================================
STRIPE REFUND
============================================================
*/

async function refundOrder(
  orderId,
  reason
) {
  const result =
    await pool.query(
      `
      SELECT *
      FROM orders
      WHERE order_id =
        $1
      LIMIT 1
      `,
      [
        orderId,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      "Order not found"
    );
  }

  const order =
    result.rows[0];

  /*
  Already refunded.
  */

  if (
    order.stripe_refund_id
  ) {
    return {
      alreadyRefunded:
        true,

      refundId:
        order.stripe_refund_id,
    };
  }

  if (
    !order.stripe_payment_intent_id
  ) {
    throw new Error(
      "Stripe PaymentIntent not available"
    );
  }

  const refund =
    await stripe.refunds.create(
      {
        payment_intent:
          order.stripe_payment_intent_id,

        metadata: {
          orderId:
            order.order_id,

          reason:
            String(
              reason ||
                "PGNT ASIAN refund"
            ),
        },
      }
    );

  await pool.query(
    `
    UPDATE orders
    SET
      stripe_refund_id =
        $1,

      refund_status =
        $2,

      updated_at =
        NOW()

    WHERE order_id =
      $3
    `,
    [
      refund.id,

      refund.status ||
        "pending",

      order.order_id,
    ]
  );

  console.log(
    "STRIPE REFUND:",
    refund.id
  );

  return refund;
}

/*
============================================================
ORDER STATUS
============================================================
*/

app.get(
  "/api/orders/:orderId",
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            order_id,
            country,
            phone,
            operator,
            amount,
            currency,
            product_price_cents,
            fee_cents,
            bonus_amount,
            charge_cents,
            status,
            dtone_transaction_id,
            dtone_status,
            error_message,
            stripe_refund_id,
            refund_status,
            created_at,
            paid_at,
            completed_at,
            updated_at
          FROM orders
          WHERE order_id =
            $1
          LIMIT 1
          `,
          [
            req.params.orderId,
          ]
        );

      if (
        result.rows.length ===
        0
      ) {
        return res.status(404).json({
          error:
            "Order not found",
        });
      }

      res.json({
        order:
          result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/*
============================================================
ADMIN ORDERS
============================================================
*/

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT *
          FROM orders
          ORDER BY
            created_at DESC
          LIMIT 200
          `
        );

      res.json({
        orders:
          result.rows,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/*
============================================================
ADMIN MANUAL REFUND
============================================================
*/

app.post(
  "/api/admin/orders/:orderId/refund",
  requireAdmin,
  async (req, res) => {
    try {
      const refund =
        await refundOrder(
          req.params.orderId,
          req.body.reason ||
            "Admin refund"
        );

      res.json({
        success: true,

        refundId:
          refund.id,

        status:
          refund.status,
      });
    } catch (error) {
      res.status(400).json({
        error:
          error.message,
      });
    }
  }
);

/*
============================================================
ROOT
============================================================
*/

app.get(
  "/",
  (_req, res) => {
    res.json({
      service:
        "PGNT ASIAN TOPUP Backend",

      status:
        "online",
    });
  }
);

/*
============================================================
START SERVER
============================================================
*/

async function start() {
  try {
    await initDatabase();

    app.listen(
      PORT,
      () => {
        console.log(
          `PGNT ASIAN backend running on port ${PORT}`
        );

        console.log(
          `DT One API: ${DTONE_API_BASE_URL}`
        );
      }
    );
  } catch (error) {
    console.error(
      "SERVER STARTUP FAILED:",
      error
    );

    process.exit(1);
  }
}

start();
