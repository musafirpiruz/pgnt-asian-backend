require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 10000;
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'PGNT ASIAN TOPUP Backend', fee: '€0.79 controllable', timestamp: new Date().toISOString(), env: { hasStripe: !!process.env.STRIPE_SECRET_KEY, hasDtone: !!process.env.DTONE_API_KEY } });
});
app.get('/', (req, res) => {
  res.json({ message: 'PGNT ASIAN TOPUP Backend is Live! 🚀', fee: '€0.79', endpoints: ['GET /health','POST /api/payments/checkout','POST /api/dtone/topup'] });
});
app.post('/api/payments/checkout', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.json({ warning: 'Set STRIPE_SECRET_KEY in Render', checkoutUrl: 'https://checkout.stripe.com/mock', mock: true });
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { amount, phone, operator } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'eur', product_data: { name: `Top-Up ${phone} - ${operator}` }, unit_amount: Math.round((amount + 0.79) * 100) }, quantity: 1 }],
      mode: 'payment',
      success_url: 'https://pgnt.app/success',
      cancel_url: 'https://pgnt.app/cancel',
    });
    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/dtone/products', (req, res) => {
  const country = req.query.country || 'AF';
  res.json({ mockProducts: [{ product_id: 100, country, operator: 'Roshan', amount: 100, bonus: 10 }, { product_id: 250, country, operator: 'Roshan', amount: 250, bonus: 35 }] });
});
app.post('/api/dtone/topup', (req, res) => {
  res.json({ mock: true, transaction_id: 'MOCK-' + Date.now(), status: 'SUCCESS' });
});
app.post('/api/stripe/webhook', (req, res) => { res.json({ received: true }); });
app.listen(PORT, '0.0.0.0', () => { console.log(`✅ PGNT Backend running on port ${PORT}`); });
