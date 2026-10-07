# PGNT ASIAN TOPUP — Premium Mobile Top-Up App
## 🇦🇫 Afghanistan • 🇵🇰 Pakistan • 🇧🇩 Bangladesh • 🇮🇳 India

> **Fee: €0.79 | Bonus & Fee Controllable by Owner**
> **Backend: Stripe + DT One + HesabPay | Frontend: Flutter**

### Features
- 4 Countries: AFN, PKR, BDT, INR with real operators
- Premium UI: Burgundy + Gold, wallet €24.50
- Fee Control: AppConfig.fee = 0.79 (changeable to 0.50, 1.00)
- Bonus Control: AppConfig.bonuses map
- 6 Languages
- Real Payments: Stripe + DT One

### App Screens
Onboarding, Home, Confirm, Payment, Success, History, Wallet, Profile, Referral
### Backend Endpoints
| Method | Endpoint | Description |
| POST | /api/payments/checkout | Stripe Checkout |
| POST | /api/stripe/webhook | Verify webhook |
| POST | /api/dtone/topup | Real top-up |
| GET | /api/dtone/products | Discover product_id |
| GET | /health | Health check |

### Important Rules
1. Never put secret keys in mobile code
2. Never trust success redirect, use webhook
3. Do not guess product_id
4. Start with preprod

### Deploy Mobile Only
Step 1: GitHub Done
Step 2: Render.com - New Web Service - npm install, npm start, Free, env vars, get URL, test /health
Step 3: Stripe dashboard - API keys - Webhook
Step 4: DT One sandbox - Basic Auth
### Build APK Mobile Only
Push to GitHub -> Actions -> Build Android APK -> Success -> Artifacts -> Download -> Install

### Profit Model
Fee €0.79 per transaction, 100/day = €79/day, change fee in AppConfig.fee

### Database Supabase
SQL: create table orders (id text primary key, phone text...)

### Project Structure
main.dart, server.js, routes/, package.json

### Links
GitHub, Render, Stripe, DT One, Supabase

Built for mobile-only - No computer needed! Owner: musafirpiruz
