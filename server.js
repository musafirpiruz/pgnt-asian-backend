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

          RETURNING *
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
        "Admin catalog product error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to save catalog product",
      });
    }
  }
);

/*
 * ================================
 * ADMIN PRODUCT PRICE
 * ================================
 *
 * The customer price is controlled
 * by the server/database.
 *
 * Example:
 * product_id = 123
 * price_cents = 164
 * currency = eur
 *
 * This means the customer pays €1.64
 * before the Admin fee is added.
 */

app.put(
  "/api/admin/product-price",
  requireAdmin,
  async (req, res) => {
    try {
      const productId =
        Number(
          req.body.productId
        );

      const priceCents =
        Number(
          req.body.priceCents
        );

      const currency =
        String(
          req.body.currency ||
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
        priceCents <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid priceCents",
        });
      }

      /*
       * For Stripe checkout in this
       * version, EUR is the customer
       * payment currency.
       */

      if (
        currency !== "eur"
      ) {
        return res.status(400).json({
          error:
            "Only EUR is supported for Stripe checkout",
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

          RETURNING *
          `,
          [
            productId,
            priceCents,
            currency,
          ]
        );

      return res.json({
        success: true,
        productPrice:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Admin product price error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to save product price",
      });
    }
  }
);

/*
 * ================================
 * ADMIN SETTINGS
 * ================================
 */

/*
 * GET SETTINGS
 */

app.get(
  "/api/admin/settings",
  requireAdmin,
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            fee_percent,
            bonus_percent,
            fixed_fee_cents,
            updated_at
          FROM app_settings
          WHERE id = 1
          LIMIT 1
          `
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
        "Admin settings error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to load settings",
      });
    }
  }
);

/*
 * UPDATE SETTINGS
 */

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
          INSERT INTO app_settings (
            id,
            fee_percent,
            bonus_percent,
            fixed_fee_cents,
            updated_at
          )
          VALUES (
            1,
            $1,
            $2,
            $3,
            NOW()
          )
          ON CONFLICT (id)
          DO UPDATE SET
            fee_percent =
              EXCLUDED.fee_percent,

            bonus_percent =
              EXCLUDED.bonus_percent,

            fixed_fee_cents =
              EXCLUDED.fixed_fee_cents,

            updated_at =
              NOW()

          RETURNING *
          `,
          [
            feePercent,
            bonusPercent,
            fixedFeeCents,
          ]
        );

      return res.json({
        success: true,
        settings:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Update settings error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to update settings",
      });
    }
  }
);

/*
 * ================================
 * PUBLIC SETTINGS
 * ================================
 *
 * Only safe pricing information is
 * returned. No secret is exposed.
 */

app.get(
  "/api/settings",
  async (_req, res) => {
    try {
      const result =
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
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Settings not found",
        });
      }

      const settings =
        result.rows[0];

      return res.json({
        success: true,

        feePercent:
          Number(
            settings.fee_percent
          ),

        bonusPercent:
          Number(
            settings.bonus_percent
          ),

        fixedFeeCents:
          Number(
            settings.fixed_fee_cents
          ),
      });
    } catch (err) {
      console.error(
        "Public settings error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load settings",
      });
    }
  }
);

/*
 * ================================
 * PUBLIC CATALOG
 * ================================
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
              .trim()
              .toLowerCase()
          : null;

      const currency =
        req.query.currency
          ? String(
              req.query.currency
            )
              .trim()
              .toLowerCase()
          : null;

      const params = [];

      let where =
        "WHERE active = TRUE";

      if (country) {
        params.push(
          country
        );

        where +=
          ` AND LOWER(country) = $${params.length}`;
      }

      if (currency) {
        params.push(
          currency
        );

        where +=
          ` AND LOWER(currency) = $${params.length}`;
      }

      const result =
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
          ${where}
          ORDER BY
            country ASC,
            amount ASC,
            operator ASC
          `,
          params
        );

      return res.json({
        success: true,
        products:
          result.rows,
      });
    } catch (err) {
      console.error(
        "Public catalog error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load catalog",
      });
    }
  }
);

/*
 * ================================
 * STRIPE CHECKOUT
 * ================================
 *
 * VERY IMPORTANT:
 *
 * The mobile app DOES NOT control:
 *
 * - Stripe currency
 * - product price
 * - fee
 * - final charge
 *
 * Everything is calculated on the
 * server from PostgreSQL.
 *
 * Stripe customer payment currency
 * is EUR.
 */

app.post(
  "/api/payments/checkout",
  async (req, res) => {
    try {
      const country =
        String(
          req.body.country ||
            ""
        )
          .trim()
          .toLowerCase();

      const phone =
        String(
          req.body.phone ||
            ""
        ).trim();

      const amount =
        Number(
          req.body.amount
        );

      const productId =
        Number(
          req.body.productId
        );

      if (!country) {
        return res.status(400).json({
          error:
            "Country is required",
        });
      }

      if (!phone) {
        return res.status(400).json({
          error:
            "Phone is required",
        });
      }

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

      /*
       * ======================================================
       * STRIPE CURRENCY IS FIXED TO EUR
       * ======================================================
       *
       * This is the important fix for:
       *
       * "Unsupported currency"
       *
       * The mobile app cannot send AFN/PKR/BDT/INR
       * as the Stripe Checkout currency.
       */

      const stripeCurrency =
        "eur";

      /*
       * ======================================================
       * GET SERVER PRICE
       * ======================================================
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
            productId,
          ]
        );

      if (
        priceResult.rows.length === 0
      ) {
        return res.status(400).json({
          error:
            "Product price is not configured",
        });
      }

      const productPrice =
        priceResult.rows[0];

      const basePriceCents =
        Number(
          productPrice.price_cents
        );

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

      /*
       * Price must be stored as EUR.
       */

      const databaseCurrency =
        String(
          productPrice.currency ||
            ""
        )
          .trim()
          .toLowerCase();

      if (
        databaseCurrency !==
        "eur"
      ) {
        return res.status(400).json({
          error:
            "Product price must be configured in EUR",
        });
      }

      /*
       * ======================================================
       * VERIFY CATALOG PRODUCT
       * ======================================================
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
          WHERE LOWER(country) = $1
            AND amount = $2
            AND product_id = $3
            AND active = TRUE
          LIMIT 1
          `,
          [
            country,
            amount,
            productId,
          ]
        );

      if (
        catalogResult.rows.length === 0
      ) {
        return res.status(400).json({
          error:
            "Product is not configured for this country and amount",
        });
      }

      const catalogProduct =
        catalogResult.rows[0];

      /*
       * ======================================================
       * ADMIN SETTINGS
       * ======================================================
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
        settingsResult.rows.length === 0
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
        feePercent < 0 ||
        feePercent > 100
      ) {
        return res.status(500).json({
          error:
            "Invalid fee setting",
        });
      }

      if (
        !Number.isFinite(
          bonusPercent
        ) ||
        bonusPercent < 0 ||
        bonusPercent > 100
      ) {
        return res.status(500).json({
          error:
            "Invalid bonus setting",
        });
      }

      if (
        !Number.isInteger(
          fixedFeeCents
        ) ||
        fixedFeeCents < 0
      ) {
        return res.status(500).json({
          error:
            "Invalid fixed fee setting",
        });
      }

      /*
       * ======================================================
       * CALCULATE CUSTOMER PRICE
       * ======================================================
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
       * ======================================================
       * CREATE UNIQUE ORDER ID
       * ======================================================
       */

      const orderId =
        `PGNT-${Date.now()}-${crypto
          .randomBytes(5)
          .toString("hex")
          .toUpperCase()}`;

      /*
       * ======================================================
       * SAVE ORDER BEFORE STRIPE
       * ======================================================
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
          country,
          phone,
          amount,
          productId,
          stripeCurrency,
          finalChargeCents,
        ]
      );

      /*
       * ======================================================
       * CREATE STRIPE CHECKOUT
       * ======================================================
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
                      stripeCurrency,

                    product_data: {
                      name:
                        `PGNT ASIAN TOPUP - ${country.toUpperCase()}`,

                      description:
                        `${catalogProduct.operator} / ${amount}`,
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
                    productId
                  ),

                country:
                  country,

                phone:
                  phone,

                amount:
                  String(
                    amount
                  ),

                currency:
                  stripeCurrency,

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
                "Stripe Checkout failed"
            ),
                        orderId,
          ]
        );

        console.error(
          "Stripe Checkout error:",
          stripeError
        );

        return res.status(400).json({
          error:
            stripeError.message ||
            "Stripe Checkout failed",
        });
      }

      /*
       * ======================================================
       * SAVE STRIPE SESSION ID
       * ======================================================
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
       * ======================================================
       * RETURN CHECKOUT
       * ======================================================
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
          stripeCurrency,

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
        "Checkout error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to create Checkout",
      });
    }
  }
);
/*
 * ============================================================
 * PROCESS PAID STRIPE ORDER
 * ============================================================
 *
 * This function is called only after Stripe webhook
 * verifies that the Checkout Session is actually paid.
 *
 * IMPORTANT:
 * The order is checked again in PostgreSQL before
 * DT One fulfillment is started.
 */

async function processPaidOrder(session) {
  if (!session || !session.id) {
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
    session.metadata || {};

  const orderId =
    String(
      metadata.orderId || ""
    ).trim();

  if (!orderId) {
    throw new Error(
      "Missing orderId in Stripe metadata"
    );
  }

  /*
   * Find the order created before Stripe Checkout.
   */

  const result =
    await pool.query(
      `
      SELECT *
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
   * ============================================================
   * IDEMPOTENCY / DUPLICATE PROTECTION
   * ============================================================
   *
   * Stripe can retry webhooks.
   *
   * We must NOT send the same paid order
   * to DT One more than once.
   */

  if (
    order.status ===
      "processing" ||
    order.status ===
      "completed"
  ) {
    console.log(
      "Order already processed:",
      orderId
    );

    return order;
  }

  /*
   * ============================================================
   * VERIFY STRIPE AMOUNT
   * ============================================================
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
   * ============================================================
   * VERIFY CURRENCY
   * ============================================================
   */

  const stripeCurrency =
    String(
      session.currency || ""
    ).toLowerCase();

  const orderCurrency =
    String(
      order.currency || ""
    ).toLowerCase();

  if (
    stripeCurrency !==
    orderCurrency
  ) {
    throw new Error(
      "Stripe currency does not match order currency"
    );
  }

  /*
   * ============================================================
   * SAVE VERIFIED PAYMENT
   * ============================================================
   */

  const paidResult =
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
        AND status = 'pending'

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

  /*
   * If another webhook request changed
   * the order at the same time, read it again.
   */

  if (
    paidResult.rows.length ===
    0
  ) {
    const current =
      await pool.query(
        `
        SELECT *
        FROM orders
        WHERE order_id = $1
        LIMIT 1
        `,
        [orderId]
      );

    if (
      current.rows.length ===
      0
    ) {
      throw new Error(
        `Order disappeared: ${orderId}`
      );
    }

    if (
      current.rows[0].status ===
        "processing" ||
      current.rows[0].status ===
        "completed"
    ) {
      return current.rows[0];
    }

    throw new Error(
      `Unable to mark order as paid: ${orderId}`
    );
  }

  const paidOrder =
    paidResult.rows[0];

  console.log(
    "STRIPE PAYMENT VERIFIED:",
    orderId
  );

  /*
   * ============================================================
   * DT ONE FULFILLMENT
   * ============================================================
   *
   * Only this verified paid order can continue.
   */

  await fulfillPaidOrder(
    paidOrder
  );

  /*
   * Return the latest database state.
   */

  const finalResult =
    await pool.query(
      `
      SELECT *
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      `,
      [orderId]
    );

  return (
    finalResult.rows[0] ||
    paidOrder
  );
}

/*
 * ============================================================
 * DT ONE HELPERS
 * ============================================================
 */

function getDtOneAuthHeader() {
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

  if (
    !apiKey ||
    !apiSecret
  ) {
    throw new Error(
      "DTONE_API_KEY or DTONE_API_SECRET is not configured"
    );
  }

  const token =
    Buffer.from(
      `${apiKey}:${apiSecret}`
    ).toString(
      "base64"
    );

  return `Basic ${token}`;
}

/*
 * ============================================================
 * DT ONE REQUEST
 * ============================================================
 */

async function dtoneRequest(
  path,
  options = {}
) {
  const url =
    `${DTONE_API_BASE_URL}${path}`;

  const headers = {
    Authorization:
      getDtOneAuthHeader(),

    Accept:
      "application/json",

    "Content-Type":
      "application/json",
  };

  const response =
    await fetch(
      url,
      {
        ...options,
        headers: {
          ...headers,
          ...(options.headers ||
            {}),
        },
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch (_) {
    data = {
      raw: text,
    };
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data ===
        "object"
        ? (
            data.message ||
            data.error ||
            data.detail
          )
        : null;

    throw new Error(
      `DT One HTTP ${response.status}: ${
        message ||
        text ||
        "Request failed"
      }`
    );
  }

  return data;
}

/*
 * ============================================================
 * FIND DT ONE PRODUCT
 * ============================================================
 *
 * Product ID is controlled by the server/database.
 * The mobile application cannot replace it.
 */

async function getConfiguredProduct(
  order
) {
  const result =
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
        AND product_id = $3
        AND active = TRUE
      LIMIT 1
      `,
      [
        order.country,
        order.amount,
        order.product_id,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      "Active DT One product is not configured for this order"
    );
  }

  return result.rows[0];
}

/*
 * ============================================================
 * CREATE DT ONE TOP-UP
 * ============================================================
 *
 * IMPORTANT:
 * The exact DT One request structure depends on the
 * product/API contract enabled for the account.
 *
 * This function keeps all credentials server-side.
 */

async function createDtOneTransaction(
  order,
  product
) {
  const phone =
    String(
      order.phone || ""
    ).trim();

  if (!phone) {
    throw new Error(
      "Order phone is missing"
    );
  }

  const productId =
    Number(
      product.product_id
    );

  if (
    !Number.isInteger(
      productId
    ) ||
    productId <= 0
  ) {
    throw new Error(
      "Invalid DT One product ID"
    );
  }

  /*
   * DT One transaction payload.
   *
   * Product ID and destination phone
   * come from the verified database order.
   */

  const payload = {
    product_id:
      productId,

    destination: {
      address:
        phone,
    },

    external_id:
      order.order_id,
  };

  console.log(
    "Sending verified paid order to DT One:",
    {
      orderId:
        order.order_id,

      productId:
        productId,

      country:
        order.country,
    }
  );

  return await dtoneRequest(
    "/transactions",
    {
      method:
        "POST",

      body:
        JSON.stringify(
          payload
        ),
    }
  );
}

/*
 * ============================================================
 * FULFILL PAID ORDER
 * ============================================================
 *
 * This function:
 *
 * 1. Confirms the order is paid.
 * 2. Locks the order against duplicate fulfillment.
 * 3. Loads the server-side DT One product.
 * 4. Sends the top-up to DT One.
 * 5. Saves the DT One transaction ID/status.
 */

async function fulfillPaidOrder(
  paidOrder
) {
  if (!paidOrder) {
    throw new Error(
      "Paid order is missing"
    );
  }

  const orderId =
    String(
      paidOrder.order_id ||
        ""
    ).trim();

  if (!orderId) {
    throw new Error(
      "Paid order ID is missing"
    );
  }

  /*
   * ============================================================
   * LOCK ORDER
   * ============================================================
   */

  const lockResult =
    await pool.query(
      `
      UPDATE orders
      SET
        status = 'processing',
        updated_at = NOW()
      WHERE order_id = $1
        AND status = 'paid'
      RETURNING *
      `,
      [orderId]
    );

  /*
   * Another request may already be processing it.
   */

  if (
    lockResult.rows.length ===
    0
  ) {
    const current =
      await pool.query(
        `
        SELECT *
        FROM orders
        WHERE order_id = $1
        LIMIT 1
        `,
        [orderId]
      );

    if (
      current.rows.length ===
      0
    ) {
      throw new Error(
        `Order not found: ${orderId}`
      );
    }

    const existing =
      current.rows[0];

    if (
      existing.status ===
        "processing" ||
      existing.status ===
        "completed"
    ) {
      return existing;
    }

    throw new Error(
      `Order is not ready for DT One fulfillment: ${existing.status}`
    );
  }

  const order =
    lockResult.rows[0];

  try {
    /*
     * Load the configured product from
     * PostgreSQL, never from an untrusted
     * mobile-app price/product combination.
     */

    const product =
      await getConfiguredProduct(
        order
      );

    /*
     * Create DT One transaction.
     */

    const transaction =
      await createDtOneTransaction(
        order,
        product
      );

    /*
     * Try common response ID fields.
     * The exact response can vary by DT One API version.
     */

    const transactionId =
      transaction &&
      (
        transaction.id ||
        transaction.transaction_id ||
        transaction.transactionId
      );

    const dtoneStatus =
      transaction &&
      (
        transaction.status ||
        transaction.state ||
        "pending"
      );

    /*
     * Save DT One transaction information.
     */

    const updateResult =
      await pool.query(
        `
        UPDATE orders
        SET
          dtone_transaction_id =
            $1,

          dtone_status =
            $2,

          status =
            CASE
              WHEN LOWER($2) IN (
                'completed',
                'successful',
                'success'
              )
              THEN 'completed'

              ELSE 'processing'
            END,

          completed_at =
            CASE
              WHEN LOWER($2) IN (
                'completed',
                'successful',
                'success'
              )
              THEN NOW()

              ELSE completed_at
            END,

          updated_at =
            NOW()

        WHERE order_id = $3

        RETURNING *
        `,
        [
          transactionId
            ? String(
                transactionId
              )
            : null,

          dtoneStatus
            ? String(
                dtoneStatus
              )
            : "pending",

          orderId,
        ]
      );

    const updatedOrder =
      updateResult.rows[0];

    console.log(
      "DT One transaction created:",
      {
        orderId:
          orderId,

        transactionId:
          transactionId
            ? String(
                transactionId
              )
            : null,

        status:
          dtoneStatus,
      }
    );

    return (
      updatedOrder ||
      order
    );
  } catch (error) {
    /*
     * Do NOT refund automatically here.
     *
     * The order is marked failed and can later
     * be reviewed/refunded by the refund flow.
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
          error.message ||
            "DT One fulfillment failed"
        ),

        orderId,
      ]
    );

    console.error(
      "DT One fulfillment failed:",
      {
        orderId,
        error:
          error.message,
      }
    );

    throw error;
  }
}

/*
 * ============================================================
 * ORDER STATUS
 * ============================================================
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
            "Order ID is required",
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
            refund_status,
            refund_reason,
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
        result.rows.length ===
        0
      ) {
        return res.status(404).json({
          error:
            "Order not found",
        });
      }

      const order =
        result.rows[0];

      /*
       * Do not expose internal payment
       * secrets or Stripe secret data.
       */

      return res.json({
        success: true,

        order: {
          orderId:
            order.order_id,

          country:
            order.country,

          phone:
            order.phone,

          amount:
            Number(
              order.amount
            ),

          productId:
            Number(
              order.product_id
            ),

          currency:
            order.currency,

          chargeCents:
            Number(
              order.charge_cents
            ),

          status:
            order.status,

          dtoneTransactionId:
            order.dtone_transaction_id,

          dtoneStatus:
            order.dtone_status,

          error:
            order.error_message,

          refundStatus:
            order.refund_status,

          refundReason:
            order.refund_reason,

          createdAt:
            order.created_at,

          paidAt:
            order.paid_at,

          completedAt:
            order.completed_at,

          updatedAt:
            order.updated_at,
        },
      });
    } catch (err) {
      console.error(
        "Order status error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load order",
      });
    }
  }
);
/*
 * ============================================================
 * ADMIN ORDERS
 * ============================================================
 *
 * Admin can securely view orders.
 */

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (req, res) => {
    try {
      const limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit || 50
            ),
            1
          ),
          200
        );

      const result =
        await pool.query(
          `
          SELECT
            order_id,
            stripe_session_id,
            stripe_payment_intent_id,
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
            stripe_refund_id,
            refund_status,
            refund_reason,
            created_at,
            paid_at,
            completed_at,
            updated_at
          FROM orders
          ORDER BY created_at DESC
          LIMIT $1
          `,
          [limit]
        );

      return res.json({
        success: true,
        orders:
          result.rows,
      });
    } catch (err) {
      console.error(
        "Admin orders error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load orders",
      });
    }
  }
);

/*
 * ============================================================
 * ADMIN SINGLE ORDER
 * ============================================================
 */

app.get(
  "/api/admin/orders/:orderId",
  requireAdmin,
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
            "Order ID is required",
        });
      }

      const result =
        await pool.query(
          `
          SELECT *
          FROM orders
          WHERE order_id = $1
          LIMIT 1
          `,
          [orderId]
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

      return res.json({
        success: true,
        order:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Admin order error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load order",
      });
    }
  }
);

/*
 * ============================================================
 * DT ONE CALLBACK
 * ============================================================
 *
 * DT One can notify the backend when the transaction
 * changes status.
 *
 * The callback token is stored in Render as:
 *
 * DTONE_CALLBACK_TOKEN
 *
 * Never put this token inside Flutter.
 */

app.post(
  "/api/dtone/callback",
  async (req, res) => {
    try {
      const configuredToken =
        String(
          process.env.DTONE_CALLBACK_TOKEN ||
            ""
        ).trim();

      if (!configuredToken) {
        console.error(
          "DTONE_CALLBACK_TOKEN is not configured"
        );

        return res.status(503).json({
          error:
            "Callback token is not configured",
        });
      }

      const providedToken =
        String(
          req.headers[
            "x-dtone-callback-token"
          ] ||
            req.headers[
              "authorization"
            ] ||
            ""
        ).trim();

      /*
       * Accept either:
       *
       * x-dtone-callback-token: TOKEN
       *
       * OR
       *
       * Authorization: Bearer TOKEN
       */

      let token =
        providedToken;

      if (
        token
          .toLowerCase()
          .startsWith(
            "bearer "
          )
      ) {
        token =
          token.substring(
            7
          ).trim();
      }

      if (
        !token ||
        token.length !==
          configuredToken.length
      ) {
        return res.status(401).json({
          error:
            "Unauthorized",
        });
      }

      let tokenValid =
        false;

      try {
        tokenValid =
          crypto.timingSafeEqual(
            Buffer.from(token),
            Buffer.from(
              configuredToken
            )
          );
      } catch (_) {
        tokenValid =
          false;
      }

      if (!tokenValid) {
        return res.status(401).json({
          error:
            "Unauthorized",
        });
      }

      /*
       * ========================================================
       * READ CALLBACK
       * ========================================================
       *
       * DT One callback formats can contain different
       * field names depending on the API/version.
       */

      const body =
        req.body || {};

      const transactionId =
        String(
          body.id ||
            body.transaction_id ||
            body.transactionId ||
            body.transaction?.id ||
            ""
        ).trim();

      const externalId =
        String(
          body.external_id ||
            body.externalId ||
            body.transaction?.external_id ||
            ""
        ).trim();

      const status =
        String(
          body.status ||
            body.state ||
            body.transaction?.status ||
            ""
        ).trim();

      if (
        !transactionId &&
        !externalId
      ) {
        return res.status(400).json({
          error:
            "Missing transaction ID or external order ID",
        });
      }

      if (!status) {
        return res.status(400).json({
          error:
            "Missing DT One transaction status",
        });
      }

      /*
       * ========================================================
       * FIND ORDER
       * ========================================================
       */

      let result;

      if (externalId) {
        result =
          await pool.query(
            `
            SELECT *
            FROM orders
            WHERE order_id = $1
            LIMIT 1
            `,
            [externalId]
          );
      } else {
        result =
          await pool.query(
            `
            SELECT *
            FROM orders
            WHERE dtone_transaction_id = $1
            LIMIT 1
            `,
            [transactionId]
          );
      }

      if (
        result.rows.length ===
        0
      ) {
        console.warn(
          "DT One callback order not found:",
          {
            transactionId,
            externalId,
          }
        );

        /*
         * Return 200 so DT One does not repeatedly
         * send the same callback forever.
         */

        return res.json({
          received: true,
          matched: false,
        });
      }

      const order =
        result.rows[0];

      /*
       * ========================================================
       * NORMALIZE STATUS
       * ========================================================
       */

      const normalizedStatus =
        status.toLowerCase();

      const successStatuses =
        new Set([
          "completed",
          "successful",
          "success",
          "done",
        ]);

      const failedStatuses =
        new Set([
          "failed",
          "failure",
          "rejected",
          "cancelled",
          "canceled",
          "refunded",
        ]);

      let orderStatus;

      if (
        successStatuses.has(
          normalizedStatus
        )
      ) {
        orderStatus =
          "completed";
      } else if (
        failedStatuses.has(
          normalizedStatus
        )
      ) {
        orderStatus =
          "failed";
      } else {
        orderStatus =
          "processing";
      }

      /*
       * ========================================================
       * UPDATE ORDER
       * ========================================================
       */

      const updateResult =
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
              $3,

            completed_at =
              CASE
                WHEN $3 = 'completed'
                THEN COALESCE(
                  completed_at,
                  NOW()
                )
                ELSE completed_at
              END,

            error_message =
              CASE
                WHEN $3 = 'failed'
                THEN COALESCE(
                  $4,
                  error_message
                )
                ELSE error_message
              END,

            updated_at =
              NOW()

          WHERE order_id = $5

          RETURNING *
          `,
          [
            transactionId ||
              null,

            status,

            orderStatus,

            failedStatuses.has(
              normalizedStatus
            )
              ? `DT One transaction status: ${status}`
              : null,

            order.order_id,
          ]
        );

      console.log(
        "DT One callback processed:",
        {
          orderId:
            order.order_id,

          transactionId:
            transactionId,

          status:
            status,

          orderStatus:
            orderStatus,
        }
      );

      return res.json({
        received: true,
        matched: true,
        orderId:
          order.order_id,
        status:
          orderStatus,
      });
    } catch (err) {
      console.error(
        "DT One callback error:",
        err
      );

      return res.status(500).json({
        error:
          "Callback processing failed",
      });
    }
  }
);

/*
 * ============================================================
 * ADMIN REFUND / REVIEW
 * ============================================================
 *
 * IMPORTANT:
 * A failed DT One top-up should NOT automatically cause
 * a Stripe refund without a controlled server-side action.
 *
 * Admin can request a refund after reviewing the order.
 */

app.post(
  "/api/admin/orders/:orderId/refund",
  requireAdmin,
  async (req, res) => {
    try {
      const orderId =
        String(
          req.params.orderId ||
            ""
        ).trim();

      const reason =
        String(
          req.body.reason ||
            "DT One top-up failed"
        ).trim();

      if (!orderId) {
        return res.status(400).json({
          error:
            "Order ID is required",
        });
      }

      const result =
        await pool.query(
          `
          SELECT *
          FROM orders
          WHERE order_id = $1
          LIMIT 1
          `,
          [orderId]
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

      const order =
        result.rows[0];

      /*
       * Only paid/failed orders should be considered.
       */

      if (
        order.status !==
          "failed" &&
        order.status !==
          "paid"
      ) {
        return res.status(400).json({
          error:
            `Order cannot be refunded from status: ${order.status}`,
        });
      }

      /*
       * We need the original Stripe PaymentIntent.
       */

      if (
        !order.stripe_payment_intent_id
      ) {
        return res.status(400).json({
          error:
            "Stripe PaymentIntent is missing",
        });
      }

      /*
       * Prevent duplicate refunds.
       */

      if (
        order.refund_status ===
          "succeeded" ||
        order.refund_status ===
          "pending"
      ) {
        return res.json({
          success: true,
          alreadyRequested: true,
          refundStatus:
            order.refund_status,
          refundId:
            order.stripe_refund_id,
        });
      }

      /*
       * Mark refund as pending BEFORE calling Stripe.
       *
       * This reduces duplicate refund requests if the
       * admin accidentally taps the button twice.
       */

      await pool.query(
        `
        UPDATE orders
        SET
          refund_status =
            'pending',

          refund_reason =
            $1,

          updated_at =
            NOW()

        WHERE order_id = $2
        `,
        [
          reason,
          orderId,
        ]
      );

      let refund;

      try {
        refund =
          await stripe.refunds.create(
            {
              payment_intent:
                order.stripe_payment_intent_id,

              amount:
                Number(
                  order.charge_cents
                ),

              metadata: {
                orderId:
                  orderId,

                reason:
                  reason,
              },
            }
          );
      } catch (stripeError) {
        await pool.query(
          `
          UPDATE orders
          SET
            refund_status =
              'failed',

            refund_reason =
              $1,

            updated_at =
              NOW()

          WHERE order_id = $2
          `,
          [
            `${reason} | Stripe refund error: ${
              stripeError.message ||
              "unknown error"
            }`,
            orderId,
          ]
        );

        console.error(
          "Stripe refund error:",
          stripeError
        );

        return res.status(400).json({
          error:
            stripeError.message ||
            "Stripe refund failed",
        });
      }

      /*
       * Save Stripe refund information.
       */

      const refundStatus =
        String(
          refund.status ||
            "pending"
        ).toLowerCase();

      const finalRefundStatus =
        refundStatus ===
          "succeeded"
          ? "succeeded"
          : "pending";

      const refundResult =
        await pool.query(
          `
          UPDATE orders
          SET
            stripe_refund_id =
              $1,

            refund_status =
              $2,

            refund_reason =
              $3,

            updated_at =
              NOW()

          WHERE order_id = $4

          RETURNING *
          `,
          [
            refund.id
              ? String(
                  refund.id
                )
              : null,

            finalRefundStatus,

            reason,

            orderId,
          ]
        );

      return res.json({
        success: true,

        order:
          refundResult.rows[0],

        refund: {
          id:
            refund.id,

          status:
            refund.status,

          amount:
            refund.amount,

          currency:
            refund.currency,
        },
      });
    } catch (err) {
      console.error(
        "Admin refund error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Refund operation failed",
      });
    }
  }
);

/*
 * ============================================================
 * ADMIN MARK ORDER FOR REVIEW
 * ============================================================
 *
 * This does NOT issue a refund.
 * It only places the order into a controlled review state.
 */

app.post(
  "/api/admin/orders/:orderId/review",
  requireAdmin,
  async (req, res) => {
    try {
      const orderId =
        String(
          req.params.orderId ||
            ""
        ).trim();

      const reason =
        String(
          req.body.reason ||
            "Manual review required"
        ).trim();

      if (!orderId) {
        return res.status(400).json({
          error:
            "Order ID is required",
        });
      }

      const result =
        await pool.query(
          `
          UPDATE orders
          SET
            status = 'review',

            error_message =
              $1,

            updated_at =
              NOW()

          WHERE order_id = $2

          RETURNING *
          `,
          [
            reason,
            orderId,
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

      return res.json({
        success: true,
        order:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        "Review order error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to place order under review",
      });
    }
  }
);

/*
 * ============================================================
 * ADMIN RETRY DT ONE
 * ============================================================
 *
 * This is intentionally restricted to orders that are already
 * paid but failed before successful fulfillment.
 *
 * An already completed order will NEVER be retried.
 */

app.post(
  "/api/admin/orders/:orderId/retry",
  requireAdmin,
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
            "Order ID is required",
        });
      }

      const result =
        await pool.query(
          `
          SELECT *
          FROM orders
          WHERE order_id = $1
          LIMIT 1
          `,
          [orderId]
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

      const order =
        result.rows[0];

      if (
        order.status ===
        "completed"
      ) {
        return res.status(400).json({
          error:
            "Completed order cannot be retried",
        });
      }

      if (
        ![
          "failed",
          "review",
        ].includes(
          order.status
        )
      ) {
        return res.status(400).json({
          error:
            `Order cannot be retried from status: ${order.status}`,
        });
      }

      /*
       * Reconfirm payment before retry.
       */

      if (
        !order.stripe_payment_intent_id
      ) {
        return res.status(400).json({
          error:
            "Stripe PaymentIntent is missing",
        });
      }

      const paymentIntent =
        await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id
        );

      if (
        paymentIntent.status !==
        "succeeded"
      ) {
        return res.status(400).json({
          error:
            "Stripe payment is not confirmed as succeeded",
        });
      }

      /*
       * Move back to paid, then use the same
       * protected fulfillment function.
       */

      const paidResult =
        await pool.query(
          `
          UPDATE orders
          SET
            status = 'paid',
            error_message = NULL,
            updated_at = NOW()
          WHERE order_id = $1
          RETURNING *
          `,
          [orderId]
        );

      const paidOrder =
        paidResult.rows[0];

      const fulfilled =
        await fulfillPaidOrder(
          paidOrder
        );

      return res.json({
        success: true,
        order:
          fulfilled,
      });
    } catch (err) {
      console.error(
        "Admin retry error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Retry failed",
      });
    }
  }
);
/*
 * ============================================================
 * ADMIN REFUND STATUS
 * ============================================================
 *
 * Allows Admin to check the current Stripe refund
 * directly from Stripe and synchronize the database.
 */

app.get(
  "/api/admin/orders/:orderId/refund",
  requireAdmin,
  async (req, res) => {
    try {
      const orderId =
        String(
          req.params.orderId || ""
        ).trim();

      if (!orderId) {
        return res.status(400).json({
          error:
            "Order ID is required",
        });
      }

      const result =
        await pool.query(
          `
          SELECT *
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

      const order =
        result.rows[0];

      if (
        !order.stripe_refund_id
      ) {
        return res.status(404).json({
          error:
            "No Stripe refund exists for this order",
        });
      }

      const refund =
        await stripe.refunds.retrieve(
          order.stripe_refund_id
        );

      const refundStatus =
        String(
          refund.status || ""
        ).toLowerCase();

      const dbRefundStatus =
        refundStatus ===
        "succeeded"
          ? "succeeded"
          : refundStatus ===
            "failed"
          ? "failed"
          : "pending";

      await pool.query(
        `
        UPDATE orders
        SET
          refund_status = $1,
          updated_at = NOW()
        WHERE order_id = $2
        `,
        [
          dbRefundStatus,
          orderId,
        ]
      );

      return res.json({
        success: true,

        refund: {
          id:
            refund.id,

          status:
            refund.status,

          amount:
            refund.amount,

          currency:
            refund.currency,

          reason:
            refund.reason,
        },
      });
    } catch (err) {
      console.error(
        "Refund status error:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to check refund",
      });
    }
  }
);

/*
 * ============================================================
 * ADMIN PRODUCT PRICE LIST
 * ============================================================
 */

app.get(
  "/api/admin/product-prices",
  requireAdmin,
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            product_id,
            price_cents,
            currency,
            updated_at
          FROM product_prices
          ORDER BY product_id ASC
          `
        );

      return res.json({
        success: true,

        products:
          result.rows,
      });
    } catch (err) {
      console.error(
        "Admin product prices error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load product prices",
      });
    }
  }
);

/*
 * ============================================================
 * ADMIN CATALOG LIST
 * ============================================================
 */

app.get(
  "/api/admin/catalog",
  requireAdmin,
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
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
        "Admin catalog error:",
        err
      );

      return res.status(500).json({
        error:
          "Unable to load admin catalog",
      });
    }
  }
);

/*
 * ============================================================
 * DELETE / DISABLE CATALOG PRODUCT
 * ============================================================
 *
 * We do NOT physically delete the product.
 * It is simply disabled so old orders remain
 * safely stored in the database.
 */

app.patch(
  "/api/admin/catalog/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const catalogId =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(
          catalogId
        ) ||
        catalogId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid catalog ID",
        });
      }

      const active =
        req.body.active ===
        undefined
          ? false
          : Boolean(
              req.body.active
            );

      const result =
        await pool.query(
          `
          UPDATE product_catalog
          SET
            active = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING *
          `,
          [
            active,
            catalogId,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Catalog product not found",
        });
      }

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
          "Unable to update catalog product",
      });
    }
  }
);

/*
 * ============================================================
 * DATABASE CONNECTION TEST
 * ============================================================
 */

async function verifyDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL is not configured."
    );

    return false;
  }

  try {
    await pool.query(
      "SELECT 1"
    );

    console.log(
      "PostgreSQL connection: OK"
    );

    return true;
  } catch (err) {
    console.error(
      "PostgreSQL connection failed:",
      err.message
    );

    return false;
  }
}

/*
 * ============================================================
 * ENVIRONMENT CHECK
 * ============================================================
 *
 * This does NOT print secret values.
 * It only shows whether required variables exist.
 */

function checkEnvironment() {
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

  if (
    missing.length > 0
  ) {
    console.warn(
      "Missing environment variables:",
      missing.join(", ")
    );
  } else {
    console.log(
      "Required environment variables: OK"
    );
  }

  return missing;
}

/*
 * ============================================================
 * GLOBAL ERROR HANDLER
 * ============================================================
 */

app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(
      "Unhandled Express error:",
      err
    );

    if (
      res.headersSent
    ) {
      return;
    }

    return res.status(500).json({
      error:
        "Internal server error",
    });
  }
);

/*
 * ============================================================
 * START SERVER
 * ============================================================
 */

async function startServer() {
  try {
    console.log(
      "Starting PGNT ASIAN TOPUP backend..."
    );

    /*
     * Check environment first.
     */
    checkEnvironment();

    /*
     * Initialize PostgreSQL tables.
     */
    await initDatabase();

    /*
     * Verify database connection.
     */
    await verifyDatabase();

    /*
     * Start HTTP server.
     */
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          "========================================"
        );

        console.log(
          "PGNT ASIAN TOPUP BACKEND"
        );

        console.log(
          "========================================"
        );

        console.log(
          `Server listening on port ${PORT}`
        );

        console.log(
          `Health: /health`
        );

        console.log(
          `Stripe webhook: /api/stripe/webhook`
        );

        console.log(
          `DT One callback: /api/dtone/callback`
        );

        console.log(
          "========================================"
        );
      }
    );
  } catch (err) {
    console.error(
      "Server startup failed:",
      err
    );

    process.exit(
      1
    );
  }
}

startServer();

/*
 * ============================================================
 * PROCESS ERROR HANDLERS
 * ============================================================
 *
 * These prevent silent crashes and make errors visible
 * in Render logs.
 */

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "UNHANDLED REJECTION:",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);
// ===== HesabPay (Afghanistan) - Mock / Placeholder =====
// ⚠️ دا یوازې د ازموینې لپاره دی. د ریښتیني تولید لپاره
// باید د HesabPay رسمي API سره وصل شي.
app.post('/api/payments/hesabpay', async (req, res) => {
  try {
    const { amount, currency, phoneNumber, orderId, countryCode, operator, operatorId } = req.body;

    // اوس مهال د ازموینې لپاره یوازې بریالیتوب ورکوو.
    // کله چې د HesabPay رسمي کیلي ترلاسه کړئ، دا کوډ د دوی د API سره بدل کړئ.
    console.log('HesabPay request:', { amount, currency, phoneNumber, orderId, countryCode, operator, operatorId });

    // دلته باید د HesabPay API ته غوښتنه واستوئ:
    // const hesabRes = await fetch('https://api.hesab.com/v1/payment/create', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.HESABPAY_API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     amount, currency, customer_phone: phoneNumber, description: 'PGNT Asian Topup',
    //   }),
    // });
    // const hesabData = await hesabRes.json();

    // د ازموینې لپاره، یوازې بریالیتوب ورکوو:
    return res.json({
      success: true,
      message: 'HesabPay payment simulated (test mode)',
      orderId,
      amount,
      currency,
    });
  } catch (err) {
    console.error('HesabPay error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
