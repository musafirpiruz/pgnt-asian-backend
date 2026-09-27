import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import crypto from "crypto";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4242);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

app.use(cors());

/*
 * IMPORTANT:
 * Stripe webhooks require the raw request body for signature verification.
 * Therefore this route must be registered before express.json().
 */
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("PAYMENT COMPLETED", {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        metadata: session.metadata
      });

      /*
       * PRODUCTION FLOW:
       * 1. Verify session.payment_status === "paid".
       * 2. Read metadata (orderId, phone, country, amount, productId).
       * 3. Idempotently mark order as paid in DB.
       * 4. Start/confirm the DT One transaction.
       * 5. Store DT One transaction ID/status.
       */
      if (session.payment_status === "paid") {
        await processPaidOrder(session.metadata || {});
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pgnt-asian-backend" });
});

/*
 * Create a Stripe Checkout Session.
 *
 * The mobile app should send:
 * {
 *   country: "AF",
 *   phone: "+937xxxxxxxx",
 *   amount: 500,
 *   productId: 12345,
 *   totalChargeEurCents: 575,
 *   currency: "eur"
 * }
 *
 * Do NOT trust price values from an untrusted client in production.
 * The final price must be calculated/validated from your server-side
 * price table before creating the Checkout Session.
 */
app.post("/api/payments/checkout", async (req, res) => {
  try {
    const {
      country,
      phone,
      amount,
      productId,
      totalChargeEurCents,
      currency = "eur"
    } = req.body || {};

    if (!country || !phone || !amount || !productId) {
      return res.status(400).json({
        error: "country, phone, amount and productId are required"
      });
    }

    if (!/^[0-9+][0-9\s-]{6,20}$/.test(String(phone))) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    const charge = Number(totalChargeEurCents);
    if (!Number.isInteger(charge) || charge < 100) {
      return res.status(400).json({
        error: "totalChargeEurCents must be a valid integer in EUR cents"
      });
    }

    const orderId = crypto.randomUUID();

    /*
     * This is the Stripe Checkout pattern documented by Stripe:
     * create a server-side Checkout Session in payment mode and redirect
     * the customer to session.url.
     */
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: String(currency).toLowerCase(),
          product_data: {
            name: `PGNT ASIAN mobile top-up (${country})`
          },
          unit_amount: charge
        },
        quantity: 1
      }],
      client_reference_id: orderId,
      metadata: {
        orderId,
        country: String(country),
        phone: String(phone),
        amount: String(amount),
        productId: String(productId)
      },
      success_url: `${process.env.APP_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_BASE_URL}/payment-cancelled`
    });

    return res.json({
      orderId,
      checkoutSessionId: session.id,
      checkoutUrl: session.url
    });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({ error: "Unable to create checkout session" });
  }
});

/*
 * Optional endpoint for the app to ask for a Checkout Session status.
 * The source of truth for fulfillment should still be the webhook.
 */
app.get("/api/payments/session/:id", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    res.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      metadata: session.metadata
    });
  } catch (err) {
    res.status(404).json({ error: "Checkout session not found" });
  }
});

/*
 * DT One transaction endpoint.
 *
 * This deliberately requires the server to receive the real productId.
 * DT One product IDs are account/environment-specific and must be obtained
 * from DT One's product/discovery data rather than guessed.
 */
app.post("/api/dtone/topup", async (req, res) => {
  try {
    const {
      externalId,
      productId,
      phone
    } = req.body || {};

    if (!externalId || !productId || !phone) {
      return res.status(400).json({
        error: "externalId, productId and phone are required"
      });
    }

    if (!process.env.DTONE_API_KEY || !process.env.DTONE_API_SECRET) {
      return res.status(503).json({
        error: "DT One credentials are not configured"
      });
    }

    const payload = {
      external_id: String(externalId),
      product_id: Number(productId),
      auto_confirm: true,
      credit_party_identifier: {
        mobile_number: String(phone)
      }
    };

    const auth = Buffer
      .from(`${process.env.DTONE_API_KEY}:${process.env.DTONE_API_SECRET}`)
      .toString("base64");

    const response = await fetch(
      `${process.env.DTONE_BASE_URL}/sync/transactions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("DT One error:", response.status, data);
      return res.status(response.status).json({
        error: "DT One transaction failed",
        details: data
      });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("DT One request error:", err);
    return res.status(500).json({ error: "DT One request failed" });
  }
});

async function processPaidOrder(metadata) {
  /*
   * Add database/idempotency logic here before calling DT One.
   * Never rely on the mobile app's success redirect as proof of payment.
   */
  console.log("Paid order ready for DT One:", metadata);

  // Example:
  // await createDtOneTransaction({
  //   externalId: metadata.orderId,
  //   productId: metadata.productId,
  //   phone: metadata.phone
  // });
}

app.listen(port, () => {
  console.log(`PGNT ASIAN backend listening on port ${port}`);
});
