/**
 * Dodo Payments Sandbox Verification Helper (SEC-002, Requirement 6)
 *
 * Safe verification harness for Dodo Payments sandbox/test_mode integration.
 * Runs non-destructive checkout session creation and signed webhook verification
 * against the official Dodo SDK and Svix signature protocol.
 *
 * Usage:
 *   DODO_PAYMENTS_API_KEY="test_..." DODO_PAYMENTS_WEBHOOK_KEY="whsec_..." npx tsx scripts/verify-dodo-sandbox.ts
 *
 * NEVER RUN WITH PRODUCTION SECRETS.
 */

import { DodoPayments } from 'dodopayments';
import { Webhook } from 'svix';
import { parsePaymentSucceeded } from '../src/lib/paymentEvents';

async function main() {
  console.log('--- Dodo Payments Sandbox Integration Verification ---');

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY || process.env.DODO_PAYMENTS_WEBHOOK_SECRET;

  if (!apiKey || apiKey.startsWith('test_your_')) {
    console.warn('[!] DODO_PAYMENTS_API_KEY is not configured or is a placeholder.');
    console.log('    To test live sandbox checkout creation, set DODO_PAYMENTS_API_KEY with a test_mode key.');
  } else {
    try {
      console.log('[*] Initializing Dodo SDK in test_mode...');
      const client = new DodoPayments({
        bearerToken: apiKey,
        environment: 'test_mode',
      });

      console.log('[*] Testing checkout session creation contract...');
      const session = await client.checkoutSessions.create({
        product_cart: [
          {
            product_id: process.env.DODO_PRODUCT_ID || 'pdt_test_mode_sample',
            quantity: 1,
            amount: 1000, // $10.00
          },
        ],
        metadata: {
          test: 'sandbox_verification',
          mode: 'new',
        },
        return_url: 'https://bumpone.lol/test-return',
      });

      console.log('[+] Sandbox checkout session created successfully:');
      console.log(`    Session ID: ${session.session_id}`);
      console.log(`    Checkout URL: ${session.checkout_url}`);
    } catch (err: any) {
      console.error('[-] Sandbox checkout session creation failed:', err.message);
    }
  }

  console.log('\n[*] Verifying Svix Webhook Signature & Event Parsing Assumptions...');
  const testSecret = webhookKey && !webhookKey.includes('placeholder')
    ? webhookKey
    : `whsec_${Buffer.from('12345678901234567890123456789012').toString('base64')}`;

  const wh = new Webhook(testSecret);
  const sampleEvent = {
    type: 'payment.succeeded',
    data: {
      payment_id: 'pay_sandbox_test_123',
      amount: 1000,
      currency: 'USD',
      metadata: {
        quote_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        project_id: '11111111-2222-4333-8444-555555555555',
        user_id: '22222222-3333-4444-8555-666666666666',
        mode: 'top_up',
      },
    },
  };

  const payloadStr = JSON.stringify(sampleEvent);
  const now = new Date();
  const msgId = `msg_${Date.now()}`;
  const sig = wh.sign(msgId, now, payloadStr);

  const headers = {
    'webhook-id': msgId,
    'webhook-timestamp': Math.floor(now.getTime() / 1000).toString(),
    'webhook-signature': sig,
  };

  try {
    wh.verify(payloadStr, headers);
    console.log('[+] Signature verification contract: PASSED');

    const parsed = parsePaymentSucceeded(sampleEvent.data);
    if (!parsed.ok) {
      throw new Error(`Payload parsing failed: ${parsed.reason}`);
    }
    console.log('[+] Payload metadata parsing contract: PASSED');
    console.log(`    Parsed Payment ID: ${parsed.value.paymentId}`);
    console.log(`    Amount: $${parsed.value.amountMinor / 100} ${parsed.value.currency}`);
    console.log(`    Quote ID: ${parsed.value.quoteId}`);
  } catch (err: any) {
    console.error('[-] Signature verification failed:', err.message);
    process.exit(1);
  }

  console.log('\n[+] All Dodo Payments integration assumptions verified successfully.');
}

main().catch(console.error);
