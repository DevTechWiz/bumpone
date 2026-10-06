import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Adversarial financial suite — the attacker controls the webhook payload
// (or replays it). Every credit decision must come from the database RPC;
// the route must never write authoritative state directly.
// ---------------------------------------------------------------------------
vi.mock('../../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../lib/dodo', () => ({
  verifyDodoWebhook: vi.fn(),
  createDodoCheckoutSession: vi.fn(),
}));
vi.mock('../../lib/boardCache', () => ({
  invalidateBoardCache: vi.fn(),
}));

import { supabaseAdmin } from '../../lib/supabase/admin';
import { verifyDodoWebhook } from '../../lib/dodo';
import { invalidateBoardCache } from '../../lib/boardCache';
import { POST as postWebhook } from '../../app/api/webhooks/dodo/route';
import { tableCalls, expectNoServiceRoleUse, resetHelpers } from './helpers';

const UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const UUID_B = '11111111-1111-4111-8111-111111111111';

function makeRequest(body: unknown, headers: Record<string, string | null> = {}): NextRequest {
  const h: Record<string, string> = {
    'webhook-id': 'msg_evt_1',
    'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
    'webhook-signature': 'v1,adversarial',
    'content-type': 'application/json',
  };
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete h[k];
    else h[k] = v;
  }
  return new NextRequest('http://localhost/api/webhooks/dodo', {
    method: 'POST',
    headers: h,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const paymentEvent = (overrides: any = {}) => ({
  type: 'payment.succeeded',
  data: {
    payment_id: 'pay_adv_1',
    amount: 1000,
    metadata: { quote_id: UUID, project_id: UUID, user_id: UUID_B },
    ...overrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  resetHelpers();
  vi.mocked(verifyDodoWebhook).mockImplementation(
    (raw: string) => JSON.parse(raw)
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('financial attacks — forged / modified webhooks', () => {
  it('forged webhook (signature verification rejects) → 401, zero DB contact', async () => {
    vi.mocked(verifyDodoWebhook).mockImplementation(() => {
      throw new Error('bad signature');
    });
    const res = await postWebhook(makeRequest(paymentEvent()));
    expect(res.status).toBe(401);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expectNoServiceRoleUse();
  });

  it('modified currency (EUR) is rejected by payload validation before the RPC', async () => {
    const res = await postWebhook(makeRequest(paymentEvent({ currency: 'EUR' })));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(false);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(invalidateBoardCache).not.toHaveBeenCalled();
  });

  it('modified amount: route never credits directly — only an RPC success can', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { status: 'error', message: 'Amount does not match quoted amount' },
      error: null,
    } as any);
    const res = await postWebhook(makeRequest(paymentEvent({ amount: 1 })));
    const body = await res.json();
    expect(body.success).toBe(false);
    // the attacker-controlled amount is passed through for DB validation…
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'process_dodo_purchase',
      expect.objectContaining({ p_amount_minor: expect.any(Number) })
    );
    // …and nothing is credited without an RPC success.
    expect(invalidateBoardCache).not.toHaveBeenCalled();
    expect(tableCalls).toEqual([]); // route never touches tables itself
  });

  it('modified quote id (valid uuid, wrong quote) → deterministic DB rejection, no credit', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { status: 'error', message: 'Quote already used, expired, or cancelled' },
      error: null,
    } as any);
    const res = await postWebhook(makeRequest(paymentEvent({ metadata: { quote_id: UUID_B } })));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(invalidateBoardCache).not.toHaveBeenCalled();
    expect(tableCalls).toEqual([]);
  });

  it('malformed metadata uuid (project/quote) never reaches the RPC (no PostgREST 400 retry loop)', async () => {
    const res = await postWebhook(makeRequest({ type: 'payment.succeeded', data: { payment_id: 'p', amount: 1000, metadata: { quote_id: 'not-a-uuid' } } }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(false);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('missing webhook id → 400 (no idempotency key means no processing)', async () => {
    const res = await postWebhook(makeRequest(paymentEvent(), { 'webhook-id': null }));
    expect(res.status).toBe(400);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('forges nothing on refunds/disputes: refund.succeeded and payment.dispute are audit-log only', async () => {
    for (const type of ['refund.succeeded', 'payment.dispute']) {
      const res = await postWebhook(makeRequest({ type, data: { id: 'x' } }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ignored).toBe(true);
      expect(body.reason).toBe('refunds_not_supported');
    }
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expectNoServiceRoleUse();
  });
});

describe('financial attacks — database-authority contract (RPC verdicts)', () => {
  const rejections: Array<[string, string]> = [
    ['expired quote', 'Quote expired'],
    ['reused/paid/cancelled quote', 'Quote already used, expired, or cancelled'],
    ['modified user (quote owned by someone else)', 'Quote user does not match payment metadata'],
    ['modified project (quote for another project)', 'Quote project mismatch'],
    ['amount below floor', 'Amount below minimum'],
    ['duplicate provider payment id', 'Payment id already processed'],
    ['cancelled payment', 'Payment not in a payable state'],
  ];

  it.each(rejections)('%s → success:false, no cache invalidation, no direct table write', async (_label, message) => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { status: 'error', message },
      error: null,
    } as any);
    const res = await postWebhook(makeRequest(paymentEvent()));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(invalidateBoardCache).not.toHaveBeenCalled();
    expect(tableCalls).toEqual([]);
  });

  it('duplicate delivery of the same provider payment id → already_processed, no double credit', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { status: 'already_processed' },
      error: null,
    } as any);
    const res = await postWebhook(makeRequest(paymentEvent()));
    const body = await res.json();
    expect(body).toEqual({ success: true, already_processed: true });
    expect(invalidateBoardCache).not.toHaveBeenCalled();
    expect(tableCalls).toEqual([]);
  });

  it('transport-level RPC failure → 500 so the provider retries (no silent loss)', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: null,
      error: { message: 'connection reset' },
    } as any);
    const res = await postWebhook(makeRequest(paymentEvent()));
    expect(res.status).toBe(500);
    expect(invalidateBoardCache).not.toHaveBeenCalled();
  });
});
