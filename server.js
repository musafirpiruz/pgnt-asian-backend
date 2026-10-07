require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Health check - must work even without env vars
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'PGNT ASIAN TOPUP Backend',
    fee: '€0.79 controllable',
    timestamp: new Date().toISOString(),
    env: {
      hasStripe: !!process.env.STRIPE_SECRET_KEY,
      hasDtone: !!process.env.DTONE_API_KEY,
      node: process.version
    }
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'PGNT ASIAN TOPUP Backend is Live! 🚀',
    fee: '€0.79',
    endpoints: [
      'GET /health',
      'POST /api/payments/checkout',
      'POST /api/stripe/webhook',
      'POST /api/dtone/topup',
      'GET /api/dtone/products?country=AF'
    ]
  });
});

// Stripe checkout - with safety check
app.post('/api/payments/checkout', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(200).json({ 
        warning: 'STRIPE_SECRET_KEY not set yet - set in Render Environment',
        checkoutUrl: 'https://checkout.stripe.com/mock',
        mock: true
      });
    }
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { amount, phone, operator, country } = req.body;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Top-Up ${phone} - ${operator}` },
          unit_amount: Math.round((amount + 0.79) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://pgnt.app/success',
      cancel_url: 'https://pgnt.app/cancel',
    });
    
    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (e) {
    console.error('Checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DT One products discovery
app.get('/api/dtone/products', async (req, res) => {
  const country = req.query.country || 'AF';
  res.json({
    message: `Products for ${country} - Set DTONE_API_KEY in Render to fetch real`,
    mockProducts: [
      { product_id: 100, country, operator: 'Roshan', amount: 100, bonus: 10 },
      { product_id: 250, country, operator: 'Roshan', amount: 250, bonus: 35 }
    ]
  });
});

// DT One topup
app.post('/api/dtone/topup', async (req, res) => {
  if (!process.env.DTONE_API_KEY) {
    return res.json({ 
      warning: 'DTONE_API_KEY not set',
      mock: true,
      transaction_id: 'MOCK-' + Date.now(),
      status: 'SUCCESS'
    });
  }
  res.json({ status: 'Ready - DT One integration active' });
});

// Webhook
app.post('/api/stripe/webhook', (req, res) => {
  res.json({ received: true });
});

// Start server - MUST listen on 0.0.0.0 for Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ PGNT Backend running on port ${PORT}`);
  console.log(`Fee: €0.79 controllable`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
