import { describe, it, expect } from 'vitest';
import { Webhook } from 'svix';

describe('Dodo Payments & Webhook Verification Contract', () => {
  const secret = `whsec_${Buffer.from('12345678901234567890123456789012').toString('base64')}`;

  it('verifies valid Svix webhook signature and extracts payload', () => {
    const wh = new Webhook(secret);
    const payload = JSON.stringify({
      type: 'payment.succeeded',
      event_id: 'evt_123456',
      data: {
        payment_id: 'pay_789',
        total_amount: 5000, // $50 in minor units
        currency: 'USD',
        status: 'succeeded',
        metadata: {
          project_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          quote_id: 'quote_987',
          mode: 'top_up',
        },
      },
    });

    const timestamp = new Date();
    const msgId = 'msg_test_123';
    const signature = wh.sign(msgId, timestamp, payload);

    const headers = {
      'webhook-id': msgId,
      'webhook-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'webhook-signature': signature,
    };

    wh.verify(payload, headers);
    const verified = JSON.parse(payload) as {
      type: string;
      event_id: string;
      data: { payment_id: string; total_amount: number; metadata: { project_id: string; quote_id: string } };
    };

    expect(verified.type).toBe('payment.succeeded');
    expect(verified.event_id).toBe('evt_123456');
    expect(verified.data.payment_id).toBe('pay_789');
    expect(verified.data.total_amount).toBe(5000);
    expect(verified.data.metadata.project_id).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
  });

  it('rejects tampered webhook payloads or invalid signatures', () => {
    const wh = new Webhook(secret);
    const payload = JSON.stringify({ type: 'payment.succeeded' });
    const fakeHeaders = {
      'webhook-id': 'msg_fake',
      'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
      'webhook-signature': 'v1,invalid_signature_hash',
    };

    expect(() => wh.verify(payload, fakeHeaders)).toThrow();
  });
});
