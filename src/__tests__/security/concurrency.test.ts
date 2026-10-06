import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Adversarial concurrency suite — duplicate deliveries, request floods, and
// simultaneous admin mutations must serialize to a single authoritative
// outcome. Rate limiting uses the REAL limiter (reset per test); webhook
// dedupe is simulated as the database would enforce it (first writer wins).
// ---------------------------------------------------------------------------
vi.mock('../../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../../lib/dodo', () => ({
  verifyDodoWebhook: vi.fn(),
  createDodoCheckoutSession: vi.fn(),
}));
vi.mock('../../lib/boardCache', () => ({
  invalidateBoardCache: vi.fn(),
}));

import { supabaseAdmin } from '../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { verifyDodoWebhook } from '../../lib/dodo';
import { invalidateBoardCache } from '../../lib/boardCache';
import { resetRateLimits } from '../../lib/rateLimit';
import { POST as postPurchase } from '../../app/api/purchase/create/route';
import { POST as postModerate } from '../../app/api/admin/moderate/route';
import { POST as postReactions } from '../../app/api/reactions/route';
import { POST as postWebhook } from '../../app/api/webhooks/dodo/route';
import { mockTables, tableCalls, builders, makeBuilder, resetHelpers } from './helpers';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_P = '22222222-2222-4222-8222-222222222222';
const UUID_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function mockAuth(user: { id: string; email?: string; app_metadata?: any } | null, rpcResult?: any) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue(
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } }
      ),
    },
    rpc: vi.fn().mockResolvedValue(
      rpcResult ?? { data: { success: true, count: 1, already_reacted: false }, error: null }
    ),
  };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as any);
  return client;
}

function json(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  resetHelpers();
  vi.stubEnv('PURCHASES_PAUSED', 'false');
  vi.stubEnv('ADMIN_EMAILS', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Checkout flood — the 5/min budget holds under true parallelism: exactly 5
// requests pass the limiter, the rest are rejected before any pause/DB work.
// ---------------------------------------------------------------------------
describe('concurrent checkout flood', () => {
  it('10 parallel purchases → exactly 5 non-429 responses and ≤5 pause reads', async () => {
    mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {} });
    // Bodies are intentionally invalid: the limiter runs BEFORE body parsing,
    // so 429-vs-not is a pure limiter signal (400 = passed the limiter).
    const attempts = Array.from({ length: 10 }, () =>
      postPurchase(json('http://localhost/api/purchase/create', {}))
    );
    const results = await Promise.all(attempts);
    const statuses = results.map((r) => r.status);

    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    expect(statuses.filter((s) => s !== 429)).toHaveLength(5);
    expect(tableCalls.filter((t) => t === 'system_state').length).toBeLessThanOrEqual(5);
    expect(tableCalls.filter((t) => t === 'users').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate webhook delivery — 10 simultaneous deliveries of the SAME event
// must credit exactly once (DB-side dedupe simulated: first writer wins).
// ---------------------------------------------------------------------------
describe('concurrent duplicate webhook delivery', () => {
  it('credits exactly once and invalidates the cache exactly once', async () => {
    let seen = false;
    vi.mocked(verifyDodoWebhook).mockImplementation((raw: string) => JSON.parse(raw));
    vi.mocked(supabaseAdmin.rpc).mockImplementation((async () => {
      if (!seen) {
        seen = true;
        return { data: { status: 'success', new_rank: 42 }, error: null };
      }
      return { data: { status: 'already_processed' }, error: null };
    }) as any);

    const body = {
      type: 'payment.succeeded',
      data: { payment_id: 'pay_dup_1', amount: 1000, currency: 'USD', metadata: { quote_id: UUID_P } },
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        postWebhook(
          new NextRequest('http://localhost/api/webhooks/dodo', {
            method: 'POST',
            headers: {
              'webhook-id': `msg_evt_${i}`,
              'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
              'webhook-signature': 'v1,dup',
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          })
        )
      )
    );

    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const credited = bodies.filter((b) => b.success === true && !b.already_processed);
    expect(credited).toHaveLength(1);
    expect(invalidateBoardCache).toHaveBeenCalledTimes(1);
    expect(tableCalls).toEqual([]); // route never writes authoritative state itself
  });
});

// ---------------------------------------------------------------------------
// Simultaneous moderation — two admins act on the same project at once;
// both operations complete, each leaves its own audit row, and state is
// written before audit for each operation.
// ---------------------------------------------------------------------------
describe('concurrent moderation', () => {
  it('approve + suspend in parallel → 2 updates, 2 clean audit rows, state before audit', async () => {
    mockAuth({ id: UUID_ADMIN, email: 'admin@example.com', app_metadata: { role: 'admin' } });
    mockTables(vi.mocked(supabaseAdmin.from), {
      projects: { data: [{ id: UUID_P }], error: null },
      admin_audit_log: { data: null, error: null },
    });
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const [approveRes, suspendRes] = await Promise.all([
      postModerate(json('http://localhost/api/admin/moderate', { projectId: UUID_P, status: 'approved', reason: 'approve reason ok' })),
      postModerate(json('http://localhost/api/admin/moderate', { projectId: UUID_P, status: 'suspended', reason: 'suspend reason ok' })),
    ]);

    expect(approveRes.status).toBe(200);
    expect(suspendRes.status).toBe(200);
    expect(builders.projects.update).toHaveBeenCalledTimes(2);
    expect(builders.admin_audit_log.insert).toHaveBeenCalledTimes(2);
    const reasons = builders.admin_audit_log.insert.mock.calls.map((c: any[]) => c[0].reason);
    expect(reasons).toEqual(expect.arrayContaining(['approve reason ok', 'suspend reason ok']));
    // At least the first audit row must follow its state write.
    expect(tableCalls.indexOf('admin_audit_log')).toBeGreaterThan(tableCalls.indexOf('projects'));
    expect(tableCalls.filter((t) => t === 'projects')).toHaveLength(2);
    expect(tableCalls.filter((t) => t === 'admin_audit_log')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Reaction flood — 70 parallel reactions from one session: the 60/min budget
// holds and blocked requests never reach the RPC.
// ---------------------------------------------------------------------------
describe('concurrent reaction flood', () => {
  it('70 parallel reactions → 60 RPC calls, 10 rate-limited', async () => {
    const client = mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {} });
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: { reactions_fire: 1, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0 }, error: null })
    );

    const results = await Promise.all(
      Array.from({ length: 70 }, () =>
        postReactions(json('http://localhost/api/reactions', { projectId: UUID_P, reaction: 'fire' }))
      )
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(60);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    expect(client.rpc).toHaveBeenCalledTimes(60);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
