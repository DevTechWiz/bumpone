import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Adversarial API-abuse suite — hostile parameter values and protocol
// violations must fail validation before any database work.
// ---------------------------------------------------------------------------
vi.mock('../../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../../lib/dodo', () => ({
  createDodoCheckoutSession: vi.fn(),
}));

import { supabaseAdmin } from '../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { resetRateLimits } from '../../lib/rateLimit';
import { boardMemoryCache } from '../../lib/boardCache';
import { POST as postPurchase } from '../../app/api/purchase/create/route';
import { POST as postModerate } from '../../app/api/admin/moderate/route';
import { POST as postEmergency } from '../../app/api/admin/emergency/route';
import { GET as getBoard } from '../../app/api/board/route';
import { mockTables, tableCalls, builders, resetHelpers } from './helpers';

const UUID_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_PROJECT = '11111111-1111-4111-8111-111111111111';

function mockAuth(user: { id: string; email?: string; app_metadata?: any } | null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue(
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } }
      ),
    },
  } as any);
}

const adminSession = () =>
  mockAuth({ id: UUID_ADMIN, email: 'admin@example.com', app_metadata: { role: 'admin' } });

function json(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const NEW_MODE_BODY = {
  mode: 'new',
  topUpAmount: 10,
  targetRank: 50,
  title: 'Legit Project',
  handle: 'tester',
  linkUrl: 'https://x.test',
  imageUrl: 'https://img.test/x.png',
  category: 'AI',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  resetHelpers();
  boardMemoryCache.clear();
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
// Purchase amount abuse — every hostile number fails schema validation
// before the first table read (only the pause-state lookup may precede it).
// ---------------------------------------------------------------------------
describe('POST /api/purchase/create hostile amounts', () => {
  const amountCases: Array<[string, string]> = [
    ['zero', '0'],
    ['negative', '-10'],
    ['non-integer', '9.5'],
    ['below floor (integer)', '9'],
    ['above cap', '100001'],
    ['MAX_SAFE_INTEGER', '9007199254740991'],
    ['1e400 → Infinity', '1e400'],
    ['negative exponent underflow', '0.0001'],
  ];

  it.each(amountCases)('rejects topUpAmount=%s (%s) with 400 and no table work', async (label, rawAmount) => {
    mockAuth({ id: UUID_PROJECT, email: 'u@x.test', app_metadata: {} });
    const body = JSON.stringify(NEW_MODE_BODY).replace('"topUpAmount":10', `"topUpAmount":${rawAmount}`);
    const res = await postPurchase(json('http://localhost/api/purchase/create', body));
    expect(res.status).toBe(400);
    expect(tableCalls.filter((t) => t !== 'system_state')).toEqual([]);
  });

  const rankCases: Array<[string, string]> = [
    ['zero', '0'],
    ['above board', '101'],
    ['negative', '-1'],
    ['non-integer', '1.5'],
    ['absurd', '999999999'],
  ];

  it.each(rankCases)('rejects targetRank=%s (%s) with 400 and no table work', async (label, rawRank) => {
    mockAuth({ id: UUID_PROJECT, email: 'u@x.test', app_metadata: {} });
    const body = JSON.stringify(NEW_MODE_BODY).replace('"targetRank":50', `"targetRank":${rawRank}`);
    const res = await postPurchase(json('http://localhost/api/purchase/create', body));
    expect(res.status).toBe(400);
    expect(tableCalls.filter((t) => t !== 'system_state')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Admin moderation parameter abuse — schema rejects before any project
// mutation or audit write.
// ---------------------------------------------------------------------------
describe('POST /api/admin/moderate hostile input', () => {
  beforeEach(() => adminSession());

  const invalidCases: Array<[string, unknown]> = [
    ['invalid status enum', { projectId: UUID_PROJECT, status: 'published', reason: 'long enough reason' }],
    ['missing status', { projectId: UUID_PROJECT, reason: 'long enough reason' }],
    ['short reason', { projectId: UUID_PROJECT, status: 'approved', reason: 'ok' }],
    ['overlong reason', { projectId: UUID_PROJECT, status: 'approved', reason: 'x'.repeat(501) }],
    ['control-chars-only reason (strips to empty)', { projectId: UUID_PROJECT, status: 'approved', reason: '\u0007\u0007\u0007' }],
    ['non-uuid project id', { projectId: 'evil; drop table projects', status: 'approved', reason: 'long enough reason' }],
  ];

  it.each(invalidCases)('rejects %s with 400 and touches no tables', async (_label, body) => {
    const res = await postModerate(json('http://localhost/api/admin/moderate', body));
    expect(res.status).toBe(400);
    expect(tableCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Protocol abuse against the emergency killswitch — body guard rails trip
// before authz'd state changes.
// ---------------------------------------------------------------------------
describe('POST /api/admin/emergency protocol abuse', () => {
  beforeEach(() => adminSession());

  it('rejects an oversized body with 413 and touches no tables', async () => {
    const res = await postEmergency(
      json('http://localhost/api/admin/emergency', { paused: true, reason: 'a'.repeat(9 * 1024) })
    );
    expect(res.status).toBe(413);
    expect(tableCalls).toEqual([]);
  });

  it('rejects a non-JSON content type with 415 and touches no tables', async () => {
    const res = await postEmergency(
      new NextRequest('http://localhost/api/admin/emergency', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'paused=true',
      })
    );
    expect(res.status).toBe(415);
    expect(tableCalls).toEqual([]);
  });

  it('rejects malformed JSON with 400 and touches no tables', async () => {
    const res = await postEmergency(
      json('http://localhost/api/admin/emergency', '{"paused":true,')
    );
    expect(res.status).toBe(400);
    expect(tableCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Board limit abuse — clamping must reach the actual query, not just the
// response shape.
// ---------------------------------------------------------------------------
describe('GET /api/board limit clamping', () => {
  const limitCases: Array<[string, string, number]> = [
    ['absurd huge limit', '999999999999999999999', 120],
    ['negative limit', '-5', 100],
    ['non-numeric limit', 'abc', 100],
    ['zero limit', '0', 100],
    ['in-range limit', '7', 7],
  ];

  it.each(limitCases)('%s → query limit clamped to %i (value-ordered membership)', async (_label, rawLimit, expected) => {
    mockTables(vi.mocked(supabaseAdmin.from), {
      projects: { data: [], error: null },
      system_state: { data: null, error: null },
    });

    const res = await getBoard(
      new NextRequest(`http://localhost/api/board?sort=popular&limit=${rawLimit}`)
    );

    expect(res.status).toBe(200);
    expect(builders.projects.limit.mock.calls.flat()).toContain(expected);
    // docs/04:259-263 + Directory Archive: membership is the top `limit` by
    // Active Value — no global-rank ceiling may be applied.
    expect(builders.projects.lte).not.toHaveBeenCalled();
    expect(builders.projects.not).not.toHaveBeenCalled();
    expect(builders.projects.order).toHaveBeenCalledWith('current_active_value_minor', { ascending: false });
  });
});
