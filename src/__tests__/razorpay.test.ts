import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  USD_TO_INR_RATE,
} from '@/lib/razorpay';

describe('Razorpay Standard Checkout & Signature Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RAZORPAY_KEY_ID = 'rzp_test_TjXD20nQtDERoB';
    process.env.RAZORPAY_KEY_SECRET = '5et8Dz9MCxk1j00Cc6qUTlOL';
    process.env.RAZORPAY_WEBHOOK_SECRET = '_c2T4giTHv_dJ4t';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('correctly verifies authentic HMAC-SHA256 payment signature', () => {
    const orderId = 'order_test_123456';
    const paymentId = 'pay_test_789012';
    const secret = '5et8Dz9MCxk1j00Cc6qUTlOL';

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature: validSignature,
    });

    expect(isValid).toBe(true);
  });

  it('rejects tampered or forged payment signatures', () => {
    const orderId = 'order_test_123456';
    const paymentId = 'pay_test_789012';

    const forgedSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const isValid = verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature: forgedSignature,
    });

    expect(isValid).toBe(false);
  });

  it('verifies webhook HMAC-SHA256 signature with raw payload', () => {
    const rawBody = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_999' } } },
    });
    const secret = '_c2T4giTHv_dJ4t';

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const isValid = verifyRazorpayWebhookSignature(rawBody, validSignature, secret);
    expect(isValid).toBe(true);
  });

  it('maintains expected conversion rate constant', () => {
    expect(USD_TO_INR_RATE).toBe(88);
    const usdCents = 11000; // $110.00
    const inrPaise = Math.round((usdCents / 100) * USD_TO_INR_RATE * 100);
    expect(inrPaise).toBe(968000); // ₹9,680.00
  });
});
