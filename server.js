import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import paymentsRouter from './routes/payments.js';
import stripeWebhookRouter from './routes/stripeWebhook.js';
import dtoneRouter from './routes/dtone.js';
import hesabPayRouter from './routes/hesabPay.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

// وروره - Stripe او Supabase کلاینت جوړول
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const supabase = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

// CORS - ټولو لپاره خلاص
app.use(cors({ origin: '*' }));

// Webhook - باید خام body وي مخکی د json نه
app.use('/api/stripe/webhook', express.raw({type: 'application/json'}), stripeWebhookRouter(stripe, supabase));

// نور routes
app.use(express.json());
app.use('/api/payments', paymentsRouter(stripe, supabase));
app.use('/api/dtone', dtoneRouter(supabase));
app.use('/api/hesabpay', hesabPayRouter(supabase));

// Health check - Render.com دا چک کوي
app.get('/health', (req,res)=> res.json({
  status:'ok',
  service:'PGNT ASIAN Backend',
  version:'2.0',
  endpoints:[
    'POST /api/payments/checkout',
    'POST /api/stripe/webhook',
    'GET /api/payments/session/:id',
    'POST /api/dtone/topup',
    'POST /api/hesabpay/mock',
    'GET /health'
  ],
  timestamp:new Date().toISOString()
}));

app.get('/', (req,res)=> res.json({ message:'PGNT ASIAN Backend', health:'/health' }));

app.listen(PORT, ()=> console.log(`✓ Running on ${PORT}`));
{
  "name": "pgnt-asian-backend",
  "version": "2.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "stripe": "^16.8.0",
    "axios": "^1.7.2",
    "@supabase/supabase-js": "^2.44.5",
    "uuid": "^10.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
# وروره - دا فایل GitHub ته مه اچوه!
# اصلی کیلي یی په Render.com > Environment کی ولیکه

STRIPE_SECRET_KEY=sk_test_51Hxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_1Hxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_51Hxxxxxxxxxxxxxxxxxxxx

# DT One - د موبایل ټاپ اپ لپاره
DTONE_API_KEY=your_dtone_api_key
DTONE_API_SECRET=your_dtone_secret
DTONE_BASE_URL=https://preprod-dvsapi.dtone.com
# اصلی لپاره: https://dvsapi.dtone.com

# Supabase - ډیټابیس
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# سرور
PORT=10000
NODE_ENV=production

# فرنټ اینډ URL (CORS لپاره)
FRONTEND_URL=https://pgnt-asian.com
    -- PGNT Orders Table - وروره دا SQL په Supabase SQL Editor کی Run کړه

-- 1. جدول جوړول
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE,
  customer_email TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  product_name TEXT DEFAULT 'PGNT Topup',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')),
  payment_method TEXT,
  dtone_transaction_id TEXT,
  phone_number TEXT,
  country_code TEXT DEFAULT 'AF',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index - چټکتیا لپاره
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);

-- 3. RLS بند (بیک اینډ لپاره - سرور کیلي لری)
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- 4. updated_at اتومات
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. مثال ډاټا (اختیاری)
-- INSERT INTO orders (amount, customer_email, status) VALUES (1000, 'test@pgnt.com', 'paid');
  import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function paymentsRouter(stripe, supabase) {
  const router = express.Router();

  // وروره - دا مهمه ده: Checkout Session جوړوي
  router.post('/checkout', async (req, res) => {
    try {
      const { amount, email, productName, phone, country } = req.body;

      if (!amount) {
        return res.status(400).json({ error: 'amount اړین دی' });
      }

      // Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: productName || 'PGNT Asian Topup' },
            unit_amount: Math.round(amount * 100), // په cents
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: email,
        success_url: `${process.env.FRONTEND_URL || 'https://pgnt-asian.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://pgnt-asian.com'}/cancel`,
        metadata: {
          order_id: uuidv4(),
          phone: phone || '',
          country: country || 'AF',
        }
      });

      // په Supabase کی خوندي کول
      if (supabase) {
        await supabase.from('orders').insert({
          session_id: session.id,
          customer_email: email,
          amount: amount * 100,
          product_name: productName,
          phone_number: phone,
          country_code: country,
          status: 'pending'
        });
      }

      res.json({ id: session.id, url: session.url });

    } catch (err) {
      console.error('Checkout error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Session معلومات اخیستل
  router.get('/session/:id', async (req, res) => {
    try {
      const session = await stripe.checkout.sessions.retrieve(req.params.id);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
              }
          import express from 'express';

export default function stripeWebhookRouter(stripe, supabase) {
  const router = express.Router();

  // وروره - دا ډیر مهم دی، Stripe دلته خبر راکوي چی پیسې راغلی
  router.post('/', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      // تایید چی رښتیا د Stripe نه دی
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // Test mode - پرته له تایید
        event = { type: 'checkout.session.completed', data: { object: JSON.parse(req.body.toString()) } };
      }
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // کله چی پیسې ورکړل شی
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      console.log('✓ Payment success:', session.id);

      // ډیټابیس کی update
      if (supabase) {
        await supabase.from('orders')
          .update({ status: 'paid', payment_method: 'stripe' })
          .eq('session_id', session.id);
      }

      // دلته کولی شی DT One ته هم واستوی
      // که غواړی اتومات Topup
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      if (supabase) {
        await supabase.from('orders')
          .update({ status: 'expired' })
          .eq('session_id', session.id);
      }
    }

    res.json({ received: true });
  });

  return router;
}
import express from 'express';
import axios from 'axios';

export default function dtoneRouter(supabase) {
  const router = express.Router();

  const DTONE_BASE = process.env.DTONE_BASE_URL || 'https://preprod-dvsapi.dtone.com';
  const DTONE_KEY = process.env.DTONE_API_KEY;
  const DTONE_SECRET = process.env.DTONE_API_SECRET;

  // وروره - د DT One لپاره Topup
  router.post('/topup', async (req, res) => {
    try {
      const { phone, amount, operatorId, country } = req.body;

      if (!phone) return res.status(400).json({ error: 'phone اړین دی' });

      // که کیلي نلری - mock response
      if (!DTONE_KEY) {
        console.log('⚠ DTONE mock mode');
        return res.json({
          mock: true,
          message: 'DTONE کیلي نشته - Mock بریالی',
          transaction_id: 'mock_' + Date.now(),
          phone, amount
        });
      }

      // اصلی DT One API کال
      const auth = Buffer.from(`${DTONE_KEY}:${DTONE_SECRET}`).toString('base64');

      const payload = {
        external_id: 'pgnt_' + Date.now(),
        product_id: operatorId || 1, // باید اصلی operator ID وی
        credit_party_identifier: {
          mobile_number: phone,
        },
        // amount په USD cents کی
      };

      const response = await axios.post(
        `${DTONE_BASE}/v1/async/transactions`,
        payload,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // خوندي کول
      if (supabase) {
        await supabase.from('orders').update({
          dtone_transaction_id: response.data?.id || response.data?.transaction_id,
          status: 'paid'
        }).eq('phone_number', phone).order('created_at', { ascending: false }).limit(1);
      }

      res.json({ success: true, data: response.data });

    } catch (err) {
      console.error('DTONE error:', err.response?.data || err.message);
      res.status(500).json({
        error: err.response?.data?.errors || err.message,
        mock_fallback: true
      });
    }
  });

  // Operator لیست - د هیواد لپاره
  router.get('/operators/:country', async (req, res) => {
    res.json({
      country: req.params.country,
      operators: [
        { id: 1, name: 'Roshan', country: 'AF' },
        { id: 2, name: 'MTN', country: 'AF' },
        { id: 3, name: 'Etisalat', country: 'AF' }
      ]
    });
  });

  return router;
}
import express from 'express';

export default function hesabPayRouter(supabase) {
  const router = express.Router();

  // وروره - دا فعلا Mock دی
  // کله چی اصلی HesabPay API ولری، دلته یی وصل کړه

  router.post('/mock', async (req, res) => {
    try {
      const { phone, amount, currency } = req.body;

      console.log(`HesabPay Mock: ${phone} - ${amount} ${currency || 'AFN'}`);

      // په ډیټابیس کی خوندي
      if (supabase) {
        const { data, error } = await supabase.from('orders').insert({
          customer_email: phone + '@hesabpay.local',
          amount: Math.round((amount || 100) * 100),
          currency: currency || 'AFN',
          phone_number: phone,
          product_name: 'HesabPay Topup (Mock)',
          payment_method: 'hesabpay_mock',
          status: 'paid'
        }).select().single();

        if (error) throw error;

        return res.json({
          success: true,
          mock: true,
          message: '✓ HesabPay Mock - پیسې ومنل شوی (تست)',
          order: data,
          next_step: 'اصلی HesabPay API وصل کړه کله چی ولری'
        });
      }

      res.json({
        success: true,
        mock: true,
        transaction_id: 'hesab_mock_' + Date.now(),
        amount, phone
      });

    } catch (err) {
      console.error('HesabPay mock error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // پرداخت تایید - callback لپاره
  router.post('/callback', async (req, res) => {
    console.log('HesabPay callback:', req.body);
    res.json({ received: true, mock: true });
  });

  // بیلانس چک (Mock)
  router.get('/balance', (req, res) => {
    res.json({ balance: 999999, currency: 'AFN', mock: true });
  });

  return router;
}
