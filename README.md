# PGNT ASIAN Backend — Stripe + DT One foundation

This backend is the server-side foundation for the PGNT ASIAN mobile top-up app.

## What it contains

- `POST /api/payments/checkout` — creates a Stripe hosted Checkout Session.
- `POST /api/stripe/webhook` — verifies Stripe webhook signatures and receives payment events.
- `GET /api/payments/session/:id` — retrieves a Checkout Session.
- `POST /api/dtone/topup` — server-side DT One transaction endpoint.
- `GET /health` — health check.

## Important production rules

1. Never put Stripe secret keys or DT One API secrets in Flutter/mobile code.
2. Never treat the Stripe success redirect as proof of payment; use the verified webhook.
3. Add a database and idempotency before automatically fulfilling paid orders.
4. Do not guess DT One `product_id` values. Discover the correct products for your DT One account/environment.
5. Start with DT One pre-production/sandbox before production.
6. Configure DT One callback handling for final transaction statuses.

## Stripe

The Checkout Session is created server-side in `payment` mode. The returned `checkoutUrl` can be opened by the app.

## DT One

DT One's API uses HTTP Basic authentication with API key as username and API secret as password. The example targets the pre-production DVS endpoint from the official documentation.

## Run

```bash
npm install
cp .env.example .env
npm start
```

Then configure the `.env` values.

## Next implementation step

Connect the Flutter Checkout button to:

`POST /api/payments/checkout`

and open the returned `checkoutUrl`.

After the Stripe webhook confirms `payment_status=paid`, create the DT One transaction and persist its status in a database.
