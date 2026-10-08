
# PGNT ASIAN TOPUP

**Professional Mobile Recharge Platform**

PGNT ASIAN TOPUP is a mobile recharge application designed to help customers purchase mobile top-ups for recipients in Afghanistan, Pakistan, India, and Bangladesh.

The project uses Flutter for the mobile application and a Node.js backend for payment processing and top-up integration.

---

## 🌍 Supported Countries

| Country | Code | Currency |
|---|---|---|
| Afghanistan | AF | AFN |
| Pakistan | PK | PKR |
| India | IN | INR |
| Bangladesh | BD | BDT |

## 🌐 Supported Languages

- Pashto
- Dari
- English
- Urdu
- Hindi
- Bengali

## ✨ Main Features

- Country and mobile operator selection
- Recipient phone number validation
- Product catalog loaded from the backend
- Server-controlled product pricing
- Stripe Checkout integration
- DT One top-up integration
- Order status tracking
- Transaction history
- Wallet and referral reward interface
- Customer support interface
- Android APK build using GitHub Actions

**Important:** Features that depend on database configuration, backend endpoints, provider credentials, and account authentication must be tested before production release.

---

## 🏗️ Technology Stack

### Mobile Application
- Flutter
- Dart
- HTTP client
- URL Launcher

### Backend
- Node.js
- Express
- PostgreSQL
- Stripe
- DT One API

### Build and Deployment
- GitHub Actions
- Android release APK
- Render hosting

---

## 📁 Project Structure

```text
pgnt-asian-backend/
├── .github/
│   └── workflows/
│       └── build-apk.yml
├── android/
├── lib/
│   └── main.dart
├── main.dart
├── server.js
├── database.sql
├── migrate.js
├── package.json
├── pubspec.yaml
└── README.md
```

Some files or directories may differ depending on the current repository version.

---

## 🔌 Backend Configuration

The default backend URL is:

```text
https://pgnt-asian-backend.onrender.com
```

The mobile application can use a different backend URL through a Flutter build argument:

```bash
flutter build apk --release \
  --dart-define=BACKEND_BASE_URL=https://pgnt-asian-backend.onrender.com
```

The backend should provide the required catalog, checkout, order-status, payment-webhook, and DT One transaction endpoints.

---

## 💳 Payment Security

The application must follow these security requirements:

1. Stripe secret keys must remain on the backend.
2. DT One API credentials must remain on the backend.
3. Stripe webhook signatures must be verified on the server.
4. An order must not be fulfilled before its payment is verified.
5. Payment and top-up requests must be protected against duplicate processing.
6. Product prices, fees, and bonuses must be validated and calculated server-side.
7. Order-status endpoints must verify that the requester is authorized to access the order.
8. Refunds and wallet balance changes must be recorded securely.

Never commit API secrets, passwords, private keys, database credentials, or webhook signing secrets to GitHub.

---

## 🛠️ Local Development

Install Flutter, Dart, Node.js, and PostgreSQL as required by the project.

### Flutter

```bash
flutter pub get
flutter analyze
flutter build apk --release
```

### Backend

```bash
npm install
npm start
```

The actual backend start command depends on the scripts defined in `package.json`.

Configure the required environment variables in the hosting provider's secure environment settings before starting the backend.

---

## 📦 Build an Android APK

1. Open the repository on GitHub.
2. Select **Actions**.
3. Open the Android APK workflow.
4. Select **Run workflow**, if available.
5. Wait for the workflow to finish.
6. Download the `pgnt-asian-topup-apk` artifact if the build succeeds.

A successful APK build does not, by itself, confirm that Stripe payments, DT One fulfillment, refunds, or production security are working.

---

## 🧪 Production Readiness Checklist

- [ ] Confirm the correct Flutter source file is used by the build workflow.
- [ ] Run Dart analysis and resolve compilation errors.
- [ ] Verify backend health and database connectivity.
- [ ] Resolve database schema and migration issues.
- [ ] Load and verify real DT One products and product identifiers.
- [ ] Test Stripe Checkout in test mode.
- [ ] Verify Stripe webhook signatures.
- [ ] Test successful payment followed by exactly one top-up.
- [ ] Implement and test authenticated DT One callbacks.
- [ ] Test failed top-ups, refunds, and manual review.
- [ ] Verify server-side fee and bonus administration.
- [ ] Implement secure user authentication and order ownership checks.
- [ ] Complete wallet and referral reward backend logic.
- [ ] Test all supported languages.
- [ ] Configure release signing and review Google Play requirements.

Do not enable real-money production fulfillment until the relevant tests have passed.

---

## 🔐 Environment Variables

Configure production values securely in the hosting provider.

Typical variables may include:

```text
APP_BASE_URL
DATABASE_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
DTONE_API_KEY
DTONE_API_SECRET
DTONE_BASE_URL
DTONE_CALLBACK_URL
ADMIN_API_KEY
```

Use the exact variable names expected by the current backend code.

Do not put actual secret values in this README or in the Flutter application.

---

## 📄 Project Status

PGNT ASIAN TOPUP is under development and verification.

The project aims to provide a secure, multilingual mobile top-up service. Production readiness must be established through integration tests, payment verification, database validation, and provider-specific testing.

## 📜 License

Add the appropriate license before distributing this project publicly.
