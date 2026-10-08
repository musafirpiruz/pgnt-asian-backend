
# PGNT ASIAN TOPUP

**Professional Mobile Recharge Platform**

PGNT ASIAN TOPUP is a multilingual mobile recharge project designed for customers sending mobile top-ups to Afghanistan, Pakistan, India, and Bangladesh.

## Supported Countries

| Country | Code | Currency |
|---|---|---|
| Afghanistan | AF | AFN |
| Pakistan | PK | PKR |
| India | IN | INR |
| Bangladesh | BD | BDT |

## Supported Languages

- Pashto
- Dari
- English
- Urdu
- Hindi
- Bengali

## Main Features

- Country and mobile operator selection
- Mobile number entry and validation
- Product catalog from the backend
- Server-controlled prices, fees, and bonuses
- Stripe Checkout integration
- DT One top-up integration
- Order status tracking
- Wallet and referral features
- Customer support interface
- Android APK build through GitHub Actions

Features must be tested against the actual backend before production use.

## Technology

- Flutter and Dart
- Node.js and Express
- PostgreSQL
- Stripe
- DT One API
- GitHub Actions
- Render hosting

## Backend

Default backend URL:

`https://pgnt-asian-backend.onrender.com`

The application must use the backend to retrieve products and create payment requests.

## Build Android APK

1. Open the repository on GitHub.
2. Select **Actions**.
3. Open the PGNT ASIAN TOPUP APK workflow.
4. Select **Run workflow**, if available.
5. Wait for the build to finish.
6. Download the APK artifact if the build succeeds.

## Security Requirements

- Keep Stripe and DT One secrets on the backend.
- Verify Stripe webhook signatures.
- Do not fulfill orders before verified payment.
- Prevent duplicate payment and top-up processing.
- Calculate prices, fees, and bonuses on the server.
- Protect order information with authentication and authorization.
- Test failed transactions and refunds before production.

Never commit passwords, API secrets, database credentials, or webhook signing secrets.

## Production Checklist

- [ ] Confirm the correct Flutter entry file.
- [ ] Run Dart analysis and resolve errors.
- [ ] Verify database schema and migrations.
- [ ] Verify real DT One products and identifiers.
- [ ] Test Stripe Checkout and webhook verification.
- [ ] Test successful and failed top-ups.
- [ ] Test refunds and duplicate-request protection.
- [ ] Verify server-side price, fee, and bonus controls.
- [ ] Test all supported languages.
- [ ] Configure Android release signing.
- [ ] Review Google Play requirements.

## Project Status

PGNT ASIAN TOPUP is under development and verification. A successful APK build alone does not guarantee that payment, top-up, wallet, or refund features are production-ready.

## License

Add an appropriate license before distributing this project publicly.
