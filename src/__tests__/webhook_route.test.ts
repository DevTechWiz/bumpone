import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/webhooks/dodo/route';
import { supabaseAdmin } from '../lib/supabase/admin';
import { invalidateBoardCache } from '../lib/boardCache';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

vi.mock('../lib/boardCache', () => ({
  invalidateBoardCache: vi.fn(),
}));

const UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/dodo', {
    method: 'POST',
    headers: {
      'webhook-id': 'msg_evt_1',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,unused-when-insecure-dev-flag-set',
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/webhooks/dodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Local test env: allow unsigned payloads so the tests exercise routing/validation,
    // not the Svix library (signature behavior is covered in dodo_webhooks.test.ts).
    vi.stubEnv('ALLOW_INSECURE_WEBHOOKS', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', '');
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 and never reaches the RPC when unsigned and the dev flag is absent (SEC-002)', async () => {
    vi.stubEnv('ALLOW_INSECURE_WEBHOOKS', '');
    const res = await POST(makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000, metadata: { quote_id: UUID } } }));
    expect(res.status).toBe(401);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('credits on success and invalidates the board cache', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { status: 'success', new_rank: 42 },
      error: null,
    } as any);

    const res = await POST(
      makeRequest({
        type: 'payment.succeeded',
        data: { payment_id: 'pay_1', amount: 1000, currency: 'USD', metadata: { quote_id: UUID, project_id: UUID } },
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, result: { status: 'success' } });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('process_dodo_purchase', {
      p_event_id: 'msg_evt_1',
      p_payment_id: 'pay_1',
      p_amount_minor: 1000,
      p_quote_id: UUID,
      p_project_id: UUID,
      p_payload: expect.objectContaining({ payment_id: 'pay_1' }),
    });
    expect(invalidateBoardCache).toHaveBeenCalledTimes(1);
  });

  it('treats an already-processed event as success without re-invalidating the cache', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: { status: 'already_processed' }, error: null } as any);

    const res = await POST(
      makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000, metadata: { quote_id: UUID } } })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, already_processed: true });
    expect(invalidateBoardCache).not.toHaveBeenCalled();
  });

  it('returns 200 success:false (no credit) on deterministic database rejection', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { status: 'error', message: 'Quote expired' },
      error: null,
    } as any);

    const res = await POST(
      makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000, metadata: { quote_id: UUID } } })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false, reason: 'Quote expired' });
    expect(invalidateBoardCache).not.toHaveBeenCalled();
  });

  it('returns 500 on transport-level RPC failures so the provider retries', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: { message: 'connection lost' } } as any);

    const res = await POST(
      makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000, metadata: { quote_id: UUID } } })
    );

    expect(res.status).toBe(500);
    expect(invalidateBoardCache).not.toHaveBeenCalled();
  });

  it('rejects a zero/negative amount before the RPC', async () => {
    for (const amount of [0, -500]) {
      const res = await POST(
        makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount, metadata: { quote_id: UUID } } })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: false, reason: 'invalid_amount' });
    }
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('rejects a missing payment id before the RPC', async () => {
    const res = await POST(makeRequest({ type: 'payment.succeeded', data: { amount: 1000 } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false, reason: 'missing_payment_id' });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('rejects non-USD currencies before the RPC', async () => {
    const res = await POST(
      makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000, currency: 'eur' } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false, reason: 'unsupported_currency' });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed metadata UUIDs before the RPC (no retryable PostgREST 400s)', async () => {
    const res = await POST(
      makeRequest({ type: 'payment.succeeded', data: { payment_id: 'pay_1', amount: 1000, metadata: { quote_id: 'oops' } } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false, reason: 'malformed_metadata' });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('ignores unknown event types without calling the RPC', async () => {
    const res = await POST(makeRequest({ type: 'customer.created', data: { id: 'cus_1' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, ignored: true });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
