'use strict';

// Test-only Stripe SDK replacement loaded only by refund-route HTTP integration tests.
// It never opens a network connection and deliberately returns a mismatched order
// association so the refund route must fail closed before creating a refund.
const Module = require('node:module');
const originalLoad = Module._load;

class StripeRouteMock {
  constructor() {
    this.paymentIntents = {
      retrieve: async (paymentIntentId) => ({
        id: paymentIntentId,
        status: 'succeeded',
        currency: 'eur',
        amount_received: 268,
        livemode: false,
        metadata: {
          orderId: paymentIntentId === 'pi_ci_match_existing_reservation'
            ? process.env.STRIPE_MOCK_MATCH_ORDER_ID
            : (process.env.STRIPE_MOCK_METADATA_ORDER_ID || 'intentionally-wrong-order-id'),
        },
      }),
    };
    this.refunds = {
      create: async () => {
        console.error('STRIPE_REFUNDS_CREATE_CALLED: test guard failed');
        return {
          id: 're_ci_should_not_be_created',
          amount: 268,
          currency: 'eur',
          status: 'succeeded',
        };
      },
    };
  }
}

Module._load = function loadWithStripeRouteMock(request, parent, isMain) {
  if (request === 'stripe') return StripeRouteMock;
  return originalLoad.call(this, request, parent, isMain);
};
