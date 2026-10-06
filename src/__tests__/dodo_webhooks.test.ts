import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Webhook } from 'svix';
import { verifyDodoWebhook } from '../lib/dodo';

const secret = `whsec_${Buffer.from('12345678901234567890123456789012').toString('base64')}`;

describe('Dodo Payments & Webhook Verification Contract', () => {
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

describe('verifyDodoWebhook fail-closed behavior (SEC-002)', () => {
  beforeEach(() => {
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', '');
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_SECRET', '');
    vi.stubEnv('ALLOW_INSECURE_WEBHOOKS', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const unsignedBody = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'p1', amount: 1000 } });
  const emptyHeaders = { 'webhook-id': '', 'webhook-timestamp': '', 'webhook-signature': '' };

  it('throws (rejects) when no webhook secret is configured', () => {
    expect(() => verifyDodoWebhook(unsignedBody, emptyHeaders)).toThrow('webhook secret is not configured');
  });

  it('throws when the secret is a placeholder value', () => {
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', 'whsec_your_dodo_webhook_key_here');
    expect(() => verifyDodoWebhook(unsignedBody, emptyHeaders)).toThrow('webhook secret is not configured');
  });

  it('throws in production even when ALLOW_INSECURE_WEBHOOKS is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_INSECURE_WEBHOOKS', 'true');
    expect(() => verifyDodoWebhook(unsignedBody, emptyHeaders)).toThrow('webhook secret is not configured');
  });

  it('allows unsigned parsing only with the explicit local dev flag', () => {
    vi.stubEnv('ALLOW_INSECURE_WEBHOOKS', 'true');
    const parsed = verifyDodoWebhook(unsignedBody, emptyHeaders);
    expect(parsed.type).toBe('payment.succeeded');
    expect(parsed.data.payment_id).toBe('p1');
  });

  it('verifies a real signature when a secret is configured', () => {
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', secret);
    const wh = new Webhook(secret);
    const payload = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000 } });
    const timestamp = new Date();
    const msgId = 'msg_ok';
    const headers = {
      'webhook-id': msgId,
      'webhook-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'webhook-signature': wh.sign(msgId, timestamp, payload),
    };
    expect(verifyDodoWebhook(payload, headers).data.payment_id).toBe('pay_1');
  });

  it('rejects a tampered body even when a secret is configured', () => {
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', secret);
    const wh = new Webhook(secret);
    const payload = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000 } });
    const timestamp = new Date();
    const msgId = 'msg_ok';
    const headers = {
      'webhook-id': msgId,
      'webhook-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'webhook-signature': wh.sign(msgId, timestamp, payload),
    };
    const tampered = payload.replace('pay_1', 'pay_2');
    expect(() => verifyDodoWebhook(tampered, headers)).toThrow();
  });
});
