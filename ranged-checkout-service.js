'use strict';

const crypto = require('node:crypto');
const {
  parseRangedWholesalePrice,
  calculateRangedCustomerPrice,
  buildRangedTransactionPayload,
} = require('./dtone-ranged-pricing');
const { isValidRangedDestinationAmount } = require('./dtone-ranged');

function providerCountryCode(country) {
  return ({ AF: 'AFG', PK: 'PAK', IN: 'IND', BD: 'BGD' })[String(country || '').toUpperCase()] || null;
}

function createRangedCheckoutService(deps) {
  const {
    pool, stripe, dtoneBaseUrl, dtoneTransactionPath, dtoneAuthHeader,
    callbackUrl, getPricingSettings, validatePhone, countryCurrency,
    normalizePhone, supportedCountries, formatEuro,
  } = deps;

  if (!pool || !stripe || typeof getPricingSettings !== 'function') {
    throw new Error('Ranged checkout dependencies are incomplete.');
  }

  return async function createRangedCheckout(input) {
    const country = String(input?.country || '').trim().toUpperCase();
    const providerCountry = providerCountryCode(country);
    const currency = countryCurrency(country);
    const productId = String(input?.productId || '').trim();
    const amount = Number(input?.amount);
    const phoneResult = validatePhone(input?.phone, country);
    if (!providerCountry || !currency || !phoneResult?.valid ||
        !/^\\d{1,18}$/.test(productId) ||
        !Number.isSafeInteger(amount) || amount < 75 || amount > 3000) {
      const error = new Error('Ranged checkout country, product, phone, or amount is invalid.');
      error.statusCode = 400;
      throw error;
    }

    const client = await pool.connect();
    let orderId = crypto.randomUUID();
    let orderAccessToken = crypto.randomBytes(32).toString('hex');
    let orderCreated = false;
    let providerCreated = false;
    let stripeSessionCreated = false;
    let providerQuote;

    try {
      const productResult = await client.query(
        `SELECT dtone_product_id, country_iso_code, operator_name,
                destination_currency, min_amount, max_amount,
                amount_increment, accepted_calculation_modes,
                capability_verified_at, active
         FROM dtone_ranged_products
         WHERE dtone_product_id = $1
         LIMIT 1`,
        [productId]
      );
      if (productResult.rowCount !== 1) throw new Error('Verified ranged product was not found.');
      const product = productResult.rows[0];
      if (product.active !== true || !product.capability_verified_at ||
          product.country_iso_code !== providerCountry ||
          product.destination_currency !== currency ||
          !Array.isArray(product.accepted_calculation_modes) ||
          !product.accepted_calculation_modes.includes('DESTINATION_AMOUNT')) {
        throw new Error('Ranged product is inactive or its verified capability does not match the selected country.');
      }
      const capability = {
        productType: 'RANGED_VALUE_RECHARGE',
        amountMode: 'DESTINATION_AMOUNT',
        minAmount: Number(product.min_amount),
        maxAmount: Number(product.max_amount),
        increment: Number(product.amount_increment),
      };
      if (!isValidRangedDestinationAmount(amount, capability)) {
        const error = new Error('Selected amount is outside the verified DT One range or increment.');
        error.statusCode = 400;
        throw error;
      }

      const countryConfig = supportedCountries[country];
      if (!countryConfig?.callingCode) throw new Error('Recipient calling code is not configured.');
      const normalizedPhone = normalizePhone(phoneResult.phone, country);
      const internationalPhone = `${countryConfig.callingCode}${normalizedPhone}`;

      const payload = buildRangedTransactionPayload({
        productId,
        externalId: orderId,
        destinationCurrency: currency,
        destinationAmount: amount,
        minAmount: capability.minAmount,
        maxAmount: capability.maxAmount,
        amountIncrement: capability.increment,
        internationalPhone,
        callbackUrl,
      });

      let response;
      try {
        response = await fetch(`${dtoneBaseUrl}${dtoneTransactionPath}`, {
          method: 'POST',
          headers: {
            Authorization: dtoneAuthHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify(payload),
        });
      } catch (error) {
        throw new Error('DT One ranged quote outcome is unknown; no payment was created and manual review is required.');
      }
      const responseText = await response.text();
      let providerData;
      try { providerData = responseText ? JSON.parse(responseText) : {}; }
      catch (_) { providerData = {}; }
      if (!response.ok) throw new Error('DT One could not create the ranged quote; no payment was created.');

      providerQuote = parseRangedWholesalePrice(providerData, {
        externalId: orderId,
        productId,
        destinationAmount: amount,
        destinationCurrency: currency,
        destinationUnitType: 'CURRENCY',
      });
      providerCreated = true;

      const pricing = await getPricingSettings(client, country);
      const price = calculateRangedCustomerPrice(providerQuote, pricing);
      const tokenHash = crypto.createHash('sha256').update(orderAccessToken, 'utf8').digest('hex');

      await client.query('BEGIN');
      await client.query(
        `INSERT INTO orders (
          order_id, country, operator, phone, product_id, ranged_product_id,
          fulfillment_type, amount, currency, product_price_cents, fee_cents,
          charge_cents, status, order_access_token_hash, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,NULL,$5,'RANGED',$6,$7,$8,$9,$10,
                  'awaiting_payment',$11,NOW(),NOW())`,
        [orderId, country, product.operator_name, normalizedPhone, productId,
         amount, currency, providerQuote.wholesaleTotalCents, price.feeCents,
         price.finalPriceCents, tokenHash]
      );
      orderCreated = true;
      await client.query(
        `INSERT INTO dtone_ranged_transactions (
          order_id, dtone_product_id, dtone_transaction_id, external_id,
          requested_amount, destination_currency, calculation_mode,
          wholesale_amount, wholesale_currency, provider_status, confirm_by,
          price_evidence, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,'DESTINATION_AMOUNT',$7,'EUR','CREATED',$8,$9::jsonb,NOW(),NOW())`,
        [orderId, productId, providerQuote.transactionId, orderId, amount, currency,
         (providerQuote.wholesaleTotalCents / 100), providerQuote.confirmationExpiresAt,
         JSON.stringify({
           wholesaleAmount: providerQuote.wholesaleAmount,
           wholesaleFee: providerQuote.wholesaleFee,
           wholesaleTotalCents: providerQuote.wholesaleTotalCents,
           wholesaleCurrency: providerQuote.wholesaleCurrency,
           destinationAmount: amount,
           destinationCurrency: currency,
           providerStatus: 'CREATED',
         })]
      );
      await client.query('COMMIT');

      const urls = {
        successUrl: `${deps.appBaseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${deps.appBaseUrl}/payment-cancelled`,
      };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: orderId,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: `PGNT ASIAN TOPUP - ${product.operator_name}`, description: `${amount} ${currency} mobile top-up for ${country}` },
            unit_amount: price.finalPriceCents,
          },
          quantity: 1,
        }],
        metadata: { orderId, fulfillmentType: 'RANGED', country, rangedProductId: productId, dtoneTransactionId: providerQuote.transactionId },
        payment_intent_data: { metadata: { orderId, fulfillmentType: 'RANGED' } },
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
      }, { idempotencyKey: `ranged-checkout-${orderId}` });
      stripeSessionCreated = true;
      const saved = await pool.query(
        `UPDATE orders SET stripe_session_id=$1, updated_at=NOW()
         WHERE order_id=$2 AND fulfillment_type='RANGED'
           AND (stripe_session_id IS NULL OR stripe_session_id=$1)`,
        [session.id, orderId]
      );
      if (saved.rowCount !== 1) throw new Error('Could not safely associate the Stripe session with the ranged order.');

      return {
        orderId,
        orderAccessToken,
        checkoutUrl: session.url,
        paymentCurrency: 'EUR',
        amountCents: price.finalPriceCents,
        amountFormatted: formatEuro(price.finalPriceCents),
        destinationAmount: amount,
        destinationCurrency: currency,
        providerStatus: 'CREATED',
        confirmationExpiresAt: providerQuote.confirmationExpiresAt,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      if (orderCreated && !stripeSessionCreated) {
        await pool.query(
          `UPDATE orders SET status='payment_failed', updated_at=NOW()
           WHERE order_id=$1 AND status='awaiting_payment'`,
          [orderId]
        ).catch(() => {});
        await pool.query(
          `UPDATE dtone_ranged_transactions
           SET provider_status='REVIEW', updated_at=NOW()
           WHERE order_id=$1 AND provider_status='CREATED'`,
          [orderId]
        ).catch(() => {});
      } else if (providerCreated && !orderCreated) {
        // The provider quote exists but no local order was committed. Never retry
        // creation blindly; preserve a structured error for operational review.
        error.message = `DT One quote ${providerQuote?.transactionId || 'unknown'} was created but local persistence failed; reconcile before retry. ${error.message}`;
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

module.exports = { createRangedCheckoutService, providerCountryCode };
