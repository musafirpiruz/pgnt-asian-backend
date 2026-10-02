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
 * PostgreSQL
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

/*
 * Database initialization
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
   * Admin settings
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,
      fee_percent NUMERIC NOT NULL DEFAULT 0,
      bonus_percent NUMERIC NOT NULL DEFAULT 0,
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
    VALUES (1, 0, 0, 0)
    ON CONFLICT (id) DO NOTHING;
  `);
    /*
   * Product prices controlled by Admin
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_prices (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT UNIQUE NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'eur',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("PostgreSQL database ready.");
}

app.use(cors());
/*
 * PROCESS PAID ORDER
 *
 * Stripe payment verification before fulfillment.
 */
async function processPaidOrder(session) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!session || !session.id) {
    throw new Error("Invalid Stripe session");
  }

  /*
   * 1. Stripe payment must be paid
   */
  if (session.payment_status !== "paid") {
    throw new Error("Stripe payment is not paid");
  }

  /*
   * 2. Read Stripe metadata
   */
  const metadata = session.metadata || {};

  const orderId = String(
    metadata.orderId || ""
  ).trim();

  const productId = Number(
    metadata.productId
  );

  const country = String(
    metadata.country || ""
  ).trim();

  const phone = String(
    metadata.phone || ""
  ).trim();

  const amount = Number(
    metadata.amount
  );

  const finalChargeCents = Number(
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
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    throw new Error(
      "Invalid productId in Stripe metadata"
    );
  }

  if (!country || !phone) {
    throw new Error(
      "Country or phone is missing from Stripe metadata"
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid amount in Stripe metadata"
    );
  }

  if (
    !Number.isInteger(finalChargeCents) ||
    finalChargeCents < 100
  ) {
    throw new Error(
      "Invalid finalChargeCents in Stripe metadata"
    );
  }

  /*
   * 4. Verify Stripe amount
   */
  if (
    Number(session.amount_total) !==
    finalChargeCents
  ) {
    throw new Error(
      `Stripe amount mismatch: expected ${finalChargeCents}, received ${session.amount_total}`
    );
  }

  /*
   * 5. Find order in database
   */
  const result = await pool.query(
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

  if (result.rows.length === 0) {
    throw new Error(
      `Order not found: ${orderId}`
    );
  }

  const order = result.rows[0];

  /*
   * 6. Verify Stripe session belongs to order
   */
  if (
    order.stripe_session_id &&
    order.stripe_session_id !== session.id
  ) {
    throw new Error(
      "Stripe session does not match order"
    );
  }

  /*
   * 7. Verify stored charge
   */
  if (
    Number(order.charge_cents) !==
    finalChargeCents
  ) {
    throw new Error(
      "Order charge does not match Stripe metadata"
    );
  }

  /*
   * 8. Verify product
   */
  if (
    String(order.product_id) !==
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
    String(order.country) !==
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
    String(order.phone) !==
    phone
  ) {
    throw new Error(
      "Phone mismatch"
    );
  }

  /*
   * 11. Prevent duplicate processing
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

    return;
  }

  /*
   * 12. Mark order as PAID
   */
  const updateResult = await pool.query(
    `
    UPDATE orders
    SET
      status = 'paid',
      paid_at = COALESCE(paid_at, NOW()),
      updated_at = NOW()
    WHERE order_id = $1
      AND status = 'pending'
    RETURNING
      order_id,
      status,
      paid_at
    `,
    [orderId]
  );

  if (updateResult.rows.length === 0) {
    console.log(
      "Order was already changed by another process:",
      orderId
    );

    return;
  }

  console.log(
    "ORDER PAYMENT VERIFIED:",
    updateResult.rows[0]
  );

  /*
   * DT One fulfillment will be added
   * after payment verification.
   */

  return updateResult.rows[0];
}
/*
 * IMPORTANT:
 * Stripe webhook must receive the RAW request body.
 * Therefore this route must be BEFORE express.json().
 */
/*
 * DT ONE CONFIGURATION
 */
const DTONE_API_BASE_URL =
  process.env.DTONE_API_BASE_URL ||
  "https://preprod-dvs-api.dtone.com/v1";

function getDtoneAuth() {
  const apiKey = String(
    process.env.DTONE_API_KEY || ""
  ).trim();

  const apiSecret = String(
    process.env.DTONE_API_SECRET || ""
  ).trim();

  if (!apiKey || !apiSecret) {
    throw new Error(
      "DTONE_API_KEY or DTONE_API_SECRET is not configured"
    );
  }

  return Buffer
    .from(`${apiKey}:${apiSecret}`)
    .toString("base64");
}

/*
 * Create DT One mobile top-up transaction
 *
 * IMPORTANT:
 * productId must be a real DT One product ID.
 */
async function createDtoneTopup({
  externalId,
  productId,
  phone,
  callbackUrl,
}) {
  const authorization =
    getDtoneAuth();

  const response = await fetch(
    `${DTONE_API_BASE_URL}/async/transactions`,
    {
      method: "POST",

      headers: {
        "Authorization":
          `Basic ${authorization}`,
        "Content-Type":
          "application/json",
        "Accept":
          "application/json",
      },

      body: JSON.stringify({
        external_id:
          externalId,

        product_id:
          Number(productId),

        credit_party_identifier: {
          mobile_number:
            String(phone),
        },

        auto_confirm: true,

        callback_url:
          callbackUrl,
      }),
    }
  );

  const text =
    await response.text();

  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
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
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

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
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        console.log("STRIPE CHECKOUT COMPLETED", {
          sessionId: session.id,
          paymentStatus: session.payment_status,
          metadata: session.metadata,
        });

        /*
         * Never fulfill unless Stripe says the payment is paid.
         */
        if (session.payment_status === "paid") {
          await processPaidOrder(session);
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("Webhook processing error:", err);

      return res.status(500).json({
        error: "Webhook processing failed",
      });
    }
  }
);

/*
 * Normal JSON routes come AFTER Stripe webhook.
 */
app.use(express.json());

/*
 * Health check
 */
app.get("/health", async (_req, res) => {
  let database = "not_configured";

  if (process.env.DATABASE_URL) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch (err) {
      database = "error";
    }
  }

  res.json({
    ok: true,
    service: "pgnt-asian-backend",
    database,
  });
});
/*
 * ADMIN SETTINGS
 * Fee / Bonus / Fixed Fee control
 */

function requireAdmin(req, res, next) {
  const adminKey = String(process.env.ADMIN_API_KEY || "").trim();
  const providedKey = String(req.headers["x-admin-key"] || "").trim();

  if (!adminKey) {
    console.error("ADMIN_API_KEY is missing on server.");

    return res.status(503).json({
      error: "ADMIN_API_KEY is not configured",
    });
  }

  if (!providedKey) {
    return res.status(401).json({
      error: "Admin key is required",
    });
  }

  if (providedKey !== adminKey) {
    console.error("Admin key mismatch.");

    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
  }

/*
 * GET ADMIN SETTINGS
 */
app.get(
  "/api/admin/settings",
  requireAdmin,
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          fee_percent,
          bonus_percent,
          fixed_fee_cents,
          updated_at
        FROM app_settings
        WHERE id = 1
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Settings not found",
        });
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Admin settings read error:", err);

      return res.status(500).json({
        error: "Unable to read admin settings",
      });
    }
  }
);
/*
 * GET PRODUCT PRICE
 * Admin can view a product price
 */
app.get(
  "/api/admin/product-prices/:productId",
  requireAdmin,
  async (req, res) => {
    try {
      const productId = Number(req.params.productId);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          error: "Invalid productId",
        });
      }

      const result = await pool.query(
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

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Product price not found",
        });
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Product price read error:", err);

      return res.status(500).json({
        error: "Unable to read product price",
      });
    }
  }
);

/*
 * SET PRODUCT PRICE
 * Admin controls the price
 */
app.put(
  "/api/admin/product-prices/:productId",
  requireAdmin,
  async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      const priceCents = Number(req.body?.priceCents);
      const currency = String(
        req.body?.currency || "eur"
      ).toLowerCase();

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          error: "Invalid productId",
        });
      }

      if (
        !Number.isInteger(priceCents) ||
        priceCents < 1
      ) {
        return res.status(400).json({
          error: "priceCents must be a positive integer",
        });
      }

      if (!/^[a-z]{3}$/.test(currency)) {
        return res.status(400).json({
          error: "Invalid currency",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO product_prices (
          product_id,
          price_cents,
          currency,
          updated_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (product_id)
        DO UPDATE SET
          price_cents = EXCLUDED.price_cents,
          currency = EXCLUDED.currency,
          updated_at = NOW()
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
        product: result.rows[0],
      });
    } catch (err) {
      console.error("Product price update error:", err);

      return res.status(500).json({
        error: "Unable to update product price",
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

      const fee = Number(feePercent);
      const bonus = Number(bonusPercent);
      const fixedFee = Number(fixedFeeCents);

      if (
        !Number.isFinite(fee) ||
        !Number.isFinite(bonus) ||
        !Number.isInteger(fixedFee)
      ) {
        return res.status(400).json({
          error: "Invalid fee, bonus or fixed fee",
        });
      }

      if (fee < 0 || fee > 100) {
        return res.status(400).json({
          error: "feePercent must be between 0 and 100",
        });
      }

      if (bonus < 0 || bonus > 100) {
        return res.status(400).json({
          error: "bonusPercent must be between 0 and 100",
        });
      }

      if (fixedFee < 0) {
        return res.status(400).json({
          error: "fixedFeeCents cannot be negative",
        });
      }

      const result = await pool.query(
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
        [fee, bonus, fixedFee]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Settings not found",
        });
      }

      return res.json({
        success: true,
        settings: result.rows[0],
      });
    } catch (err) {
      console.error("Admin settings update error:", err);

      return res.status(500).json({
        error: "Unable to update admin settings",
      });
    }
  }
);
/*
 * CREATE STRIPE CHECKOUT
 *
 * IMPORTANT:
 * The final Stripe price is controlled by the server.
 *
 * Flutter sends:
 *
 * Flutter does NOT control:
 *   product price
 *   fee
 *   fixed fee
 *   final Stripe charge
 */
app.post("/api/payments/checkout", async (req, res) => {
  try {
    const {
      country,
      phone,
      amount,
      productId,
    } = req.body || {};

    /*
     * Basic validation
     */
    if (!country || !phone || !amount || !productId) {
      return res.status(400).json({
        error:
          "country, phone, amount and productId are required",
      });
    }

    if (
      !/^[0-9+][0-9\s-]{6,20}$/.test(
        String(phone)
      )
    ) {
      return res.status(400).json({
        error: "Invalid phone number",
      });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const numericProductId = Number(productId);

    if (
      !Number.isInteger(numericProductId) ||
      numericProductId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid productId",
      });
    }

    /*
     * ------------------------------------------------
     * 1. GET PRODUCT PRICE FROM DATABASE
     * ------------------------------------------------
     *
     * This price is controlled by Admin.
     */
    const priceResult = await pool.query(
      `
      SELECT
        product_id,
        price_cents,
        currency
      FROM product_prices
      WHERE product_id = $1
      LIMIT 1
      `,
      [numericProductId]
    );

    if (priceResult.rows.length === 0) {
      return res.status(400).json({
        error:
          "Product price is not configured",
      });
    }

    const productPrice =
      priceResult.rows[0];

    const basePriceCents = Number(
      productPrice.price_cents
    );

    const currency = String(
      productPrice.currency || "eur"
    ).toLowerCase();

    if (
      !Number.isInteger(basePriceCents) ||
      basePriceCents <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid product price",
      });
    }

    /*
     * ------------------------------------------------
     * 2. GET ADMIN FEE / BONUS SETTINGS
     * ------------------------------------------------
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

    if (settingsResult.rows.length === 0) {
      return res.status(500).json({
        error:
          "Admin settings are not configured",
      });
    }

    const settings =
      settingsResult.rows[0];

    const feePercent = Number(
      settings.fee_percent
    );

    const bonusPercent = Number(
      settings.bonus_percent
    );

    const fixedFeeCents = Number(
      settings.fixed_fee_cents
    );

    if (
      !Number.isFinite(feePercent) ||
      !Number.isFinite(bonusPercent) ||
      !Number.isInteger(fixedFeeCents)
    ) {
      return res.status(500).json({
        error:
          "Invalid admin settings",
      });
    }

    /*
     * ------------------------------------------------
     * 3. CALCULATE CUSTOMER PAYMENT
     * ------------------------------------------------
     *
     * Customer payment:
     *
     * Product Price
     * + Percentage Fee
     * + Fixed Fee
     *
     * Bonus is NOT charged to the customer.
     */
    const percentageFeeCents =
      Math.round(
        basePriceCents *
          (feePercent / 100)
      );

    const finalChargeCents =
      basePriceCents +
      percentageFeeCents +
      fixedFeeCents;

    if (
      !Number.isInteger(
        finalChargeCents
      ) ||
      finalChargeCents < 100
    ) {
      return res.status(400).json({
        error:
          "Final charge is invalid",
      });
    }

    /*
     * ------------------------------------------------
     * 4. CREATE ORDER
     * ------------------------------------------------
     */
    const orderId =
      crypto.randomUUID();

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
        String(country),
        String(phone),
        Number(amount),
        numericProductId,
        currency,
        finalChargeCents,
      ]
    );

    /*
     * ------------------------------------------------
     * 5. CREATE STRIPE CHECKOUT
     * ------------------------------------------------
     */
    let session;

    try {
      session =
        await stripe.checkout.sessions.create({
          mode: "payment",

          line_items: [
            {
              price_data: {
                currency,

                product_data: {
                  name:
                    `PGNT ASIAN mobile top-up (${country})`,
                },

                /*
                 * IMPORTANT:
                 * Stripe receives the price
                 * calculated by our server.
                 */
                unit_amount:
                  finalChargeCents,
              },

              quantity: 1,
            },
          ],

          client_reference_id:
            orderId,

          metadata: {
            orderId,
            country: String(country),
            phone: String(phone),
            amount: String(amount),
            productId:
              String(numericProductId),

            basePriceCents:
              String(basePriceCents),

            feePercent:
              String(feePercent),

            bonusPercent:
              String(bonusPercent),

            fixedFeeCents:
              String(fixedFeeCents),

            finalChargeCents:
              String(finalChargeCents),
          },

          success_url:
            `${process.env.APP_BASE_URL}` +
            `/payment-success?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            `${process.env.APP_BASE_URL}` +
            `/payment-cancelled`,
        });
    } catch (stripeError) {
      /*
       * Stripe failed.
       * Keep the order for Admin review.
       */
      await pool.query(
        `
        UPDATE orders
        SET
          status = 'checkout_failed',
          error_message = $1,
          updated_at = NOW()
        WHERE order_id = $2
        `,
        [
          stripeError.message,
          orderId,
        ]
      );

      throw stripeError;
    }

    /*
     * ------------------------------------------------
     * 6. SAVE STRIPE SESSION ID
     * ------------------------------------------------
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
     * ------------------------------------------------
     * 7. RETURN CHECKOUT URL
     * ------------------------------------------------
     */
    return res.json({
      orderId,
      checkoutSessionId:
        session.id,
      checkoutUrl:
        session.url,

      pricing: {
        basePriceCents,
        feePercent,
        bonusPercent,
        fixedFeeCents,
        finalChargeCents,
        currency,
      },
    });

  } catch (err) {
    console.error(
      "Stripe checkout error:",
      err
    );

    return res.status(500).json({
      error:
        "Unable to create checkout session",
    });
  }
});
/*
 * GET PAYMENT SESSION
 */
app.get("/api/payments/session/:id", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.params.id
    );

    let order = null;

    if (process.env.DATABASE_URL) {
      const result = await pool.query(
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
          created_at,
          paid_at,
          completed_at
        FROM orders
        WHERE stripe_session_id = $1
        LIMIT 1
        `,
        [req.params.id]
      );

      order = result.rows[0] || null;
    }

    return res.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      metadata: session.metadata,
      order,
    });
  } catch (err) {
    console.error("Session lookup error:", err);

    return res.status(404).json({
      error: "Checkout session not found",
    });
  }
});

/*
 * GET ORDER
 */
app.get("/api/orders/:orderId", async (req, res) => {
  try {
    const result = await pool.query(
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
        completed_at
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      `,
      [req.params.orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Order lookup error:", err);

    return res.status(500).json({
      error: "Unable to retrieve order",
    });
  }
});

/*
 * DT ONE TOP-UP
 */
app.post("/api/dtone/topup", async (req, res) => {
  try {
    const {
      externalId,
      productId,
      phone,
    } = req.body || {};

    if (!externalId || !productId || !phone) {
      return res.status(400).json({
        error:
          "externalId, productId and phone are required",
      });
    }

    if (
      !process.env.DTONE_API_KEY ||
      !process.env.DTONE_API_SECRET ||
      !process.env.DTONE_BASE_URL
    ) {
      return res.status(503).json({
        error: "DT One credentials are not configured",
      });
    }

    const payload = {
      external_id: String(externalId),

      product_id: Number(productId),

      auto_confirm: true,

      credit_party_identifier: {
        mobile_number: String(phone),
      },
    };

    const auth = Buffer
      .from(
        `${process.env.DTONE_API_KEY}:${process.env.DTONE_API_SECRET}`
      )
      .toString("base64");

    const response = await fetch(
      `${process.env.DTONE_BASE_URL}/sync/transactions`,
      {
        method: "POST",

        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "DT One error:",
        response.status,
        data
      );

      return res.status(response.status).json({
        error: "DT One transaction failed",
        details: data,
      });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("DT One request error:", err);

    return res.status(500).json({
      error: "DT One request failed",
    });
  }
});

/*
 * PROCESS PAID ORDER
 *
 * This is the important idempotency section.
 */
async function processPaidOrder(session) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderId =
      session.metadata?.orderId ||
      session.client_reference_id;

    if (!orderId) {
      throw new Error(
        "Stripe session does not contain orderId"
      );
    }

    /*
     * Lock this order.
     *
     * If Stripe sends the same webhook twice,
     * only one request can process it at a time.
     */
    const result = await client.query(
      `
      SELECT *
      FROM orders
      WHERE order_id = $1
      FOR UPDATE
      `,
      [orderId]
    );

    if (result.rows.length === 0) {
      throw new Error(
        `Order ${orderId} not found`
      );
    }

    const order = result.rows[0];

    /*
     * IDempotency:
     * Already completed/processing orders are not processed again.
     */
    if (
      order.status === "completed" ||
      order.status === "processing"
    ) {
      await client.query("COMMIT");

      console.log(
        `Order ${orderId} already processed or processing.`
      );

      return;
    }

    /*
     * Mark payment as paid/processing BEFORE calling DT One.
     */
    await client.query(
      `
      UPDATE orders
      SET
        status = 'processing',
        paid_at = COALESCE(paid_at, NOW()),
        stripe_session_id = $1,
        updated_at = NOW()
      WHERE order_id = $2
      `,
      [session.id, orderId]
    );

    await client.query("COMMIT");

    /*
     * DT One call happens AFTER DB transaction is committed.
     */
    const dtoneResult = await createDtOneTransaction({
      externalId: orderId,
      productId: order.product_id,
      phone: order.phone,
    });

    const dtoneTransactionId =
      dtoneResult?.id ||
      dtoneResult?.transaction_id ||
      dtoneResult?.external_id ||
      null;

    const dtoneStatus =
      dtoneResult?.status ||
      "submitted";

    /*
     * Save DT One result.
     */
    await pool.query(
      `
      UPDATE orders
      SET
        status = 'completed',
        dtone_transaction_id = $1,
        dtone_status = $2,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE order_id = $3
      `,
      [
        dtoneTransactionId
          ? String(dtoneTransactionId)
          : null,
        String(dtoneStatus),
        orderId,
      ]
    );

    console.log(
      "ORDER COMPLETED:",
      orderId,
      dtoneResult
    );
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "Paid order processing failed:",
      err
    );

    /*
     * Save failure so Admin/Support can review it later.
     */
    const orderId =
      session.metadata?.orderId ||
      session.client_reference_id;

    if (orderId && process.env.DATABASE_URL) {
      await pool.query(
        `
        UPDATE orders
        SET
          status = 'failed',
          error_message = $1,
          updated_at = NOW()
        WHERE order_id = $2
        `,
        [err.message, orderId]
      );
    }

    throw err;
  } finally {
    client.release();
  }
}

/*
 * DT One server-side transaction.
 */
async function createDtOneTransaction({
  externalId,
  productId,
  phone,
}) {
  if (
    !process.env.DTONE_API_KEY ||
    !process.env.DTONE_API_SECRET ||
    !process.env.DTONE_BASE_URL
  ) {
    throw new Error(
      "DT One credentials are not configured"
    );
  }

  const payload = {
    external_id: String(externalId),

    product_id: Number(productId),

    auto_confirm: true,

    credit_party_identifier: {
      mobile_number: String(phone),
    },
  };

  const auth = Buffer
    .from(
      `${process.env.DTONE_API_KEY}:${process.env.DTONE_API_SECRET}`
    )
    .toString("base64");

  const response = await fetch(
    `${process.env.DTONE_BASE_URL}/sync/transactions`,
    {
      method: "POST",

      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },

      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "DT One transaction error:",
      response.status,
      data
    );

    throw new Error(
      `DT One transaction failed: ${response.status}`
    );
  }

  return data;
}

/*
 * Start server
 */
async function startServer() {
  try {
    await initDatabase();

    app.listen(port, () => {
      console.log(
        `PGNT ASIAN backend listening on port ${port}`
      );
    });
  } catch (err) {
    console.error(
      "Database initialization failed:",
      err
    );

    process.exit(1);
  }
}

startServer();
