import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Orphan-prevention suite: checkout reuses the caller's unpaid draft instead
// of inserting a project per attempt, and the cron sweeper deletes only rows
// that can never convert to money.
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../lib/rateLimit', () => ({
  allowRequest: vi.fn(() => true),
  allowRequestDistributed: vi.fn(async () => true),
}));
vi.mock('../lib/dodo', () => ({
  createDodoCheckoutSession: vi.fn(async () => ({
    checkoutUrl: 'https://pay.test/session',
    sessionId: 'sess_test_1',
  })),
}));

import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { POST as postPurchase } from '../app/api/purchase/create/route';
import { GET as cleanupDrafts } from '../app/api/cron/cleanup-drafts/route';
import { makeBuilder } from './security/helpers';

const UUID_USER = '11111111-1111-4111-8111-111111111111';
const UUID_DRAFT = '33333333-3333-4333-8333-333333333333';

function mockSessionUser(userId: string | null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId, app_metadata: {}, user_metadata: {} } : null },
        error: userId ? null : { message: 'Auth session missing!' },
      }),
    },
  } as any);
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function getJson(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: 'GET', headers });
}

const NEW_MODE_BODY = {
  mode: 'new',
  topUpAmount: 40,
  targetRank: 1,
  title: 'Attempt Two',
  handle: 'cupidwaveofficial',
  linkUrl: 'https://cupidwave.in',
  imageUrl: 'https://img.test/x.png',
  category: 'AI',
};

/** Ordered builders consumed by successive supabaseAdmin.from() calls. */
function queueBuilders(fromMock: any, builders: any[], tables: string[]) {
  const used: any[] = [];
  fromMock.mockImplementation((table: string) => {
    tables.push(table);
    const next = builders.shift();
    if (!next) throw new Error(`unexpected from() call: ${table}`);
    used.push(next);
    return next;
  });
  return used;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PURCHASES_PAUSED', 'false');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/purchase/create reuses unpaid drafts', () => {
  it('updates the existing draft instead of inserting on retry', async () => {
    mockSessionUser(UUID_USER);
    const tables: string[] = [];
    const updateBuilder = makeBuilder({ data: { id: UUID_DRAFT }, error: null });
    queueBuilders(vi.mocked(supabaseAdmin.from), [
      makeBuilder({ data: null, error: null }), // system_state (not paused)
      makeBuilder({ data: { id: UUID_USER, handle: 'alice' }, error: null }), // users
      makeBuilder({ data: { id: 'cat-1' }, error: null }), // categories
      makeBuilder({ data: [{ id: UUID_DRAFT }], error: null }), // reuse lookup → draft found
      makeBuilder({ data: [], error: null }), // paid-quote guard → none paid
      updateBuilder, // projects update
      makeBuilder({ data: null, error: null }), // target lookup → empty board
      makeBuilder({ data: { id: 'quote-9' }, error: null }), // quote insert
    ], tables);

    const res = await postPurchase(postJson('http://localhost/api/purchase/create', NEW_MODE_BODY));

    expect(res.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Attempt Two',
      destination_url: 'https://cupidwave.in',
    }));
    expect(updateBuilder.insert).not.toHaveBeenCalled();
  });

  it('falls back to insert when the draft already has a paid quote', async () => {
    mockSessionUser(UUID_USER);
    const tables: string[] = [];
    const insertBuilder = makeBuilder({ data: { id: 'new-draft' }, error: null });
    queueBuilders(vi.mocked(supabaseAdmin.from), [
      makeBuilder({ data: null, error: null }), // system_state
      makeBuilder({ data: { id: UUID_USER, handle: 'alice' }, error: null }), // users
      makeBuilder({ data: { id: 'cat-1' }, error: null }), // categories
      makeBuilder({ data: [{ id: UUID_DRAFT }], error: null }), // reuse lookup → draft found
      makeBuilder({ data: [{ id: 'paid-quote' }], error: null }), // paid-quote guard → paid, skip reuse
      insertBuilder, // projects insert
      makeBuilder({ data: null, error: null }), // target lookup
      makeBuilder({ data: { id: 'quote-10' }, error: null }), // quote insert
    ], tables);

    const res = await postPurchase(postJson('http://localhost/api/purchase/create', NEW_MODE_BODY));

    expect(res.status).toBe(200);
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      moderation_status: 'pending',
      is_active: false,
    }));
  });
});

describe('GET /api/cron/cleanup-drafts', () => {
  it('rejects without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', 's3cr3t');
    const res = await cleanupDrafts(getJson('http://localhost/api/cron/cleanup-drafts'));
    expect(res.status).toBe(401);
  });

  it('fails closed when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await cleanupDrafts(
      getJson('http://localhost/api/cron/cleanup-drafts', { authorization: 'Bearer x' })
    );
    expect(res.status).toBe(503);
  });

  it('expires stale quotes and deletes only money-less rows', async () => {
    vi.stubEnv('CRON_SECRET', 's3cr3t');
    const deleteQuote = makeBuilder({ data: null, error: null });
    const deleteDraft = makeBuilder({ data: null, error: null });
    queueBuilders(vi.mocked(supabaseAdmin.from), [
      makeBuilder({ data: [{ id: 'q-expired' }], error: null }), // expire update
      makeBuilder({ data: [{ id: 'q-dead' }, { id: 'q-paid' }], error: null }), // dead-quote list
      makeBuilder({ data: null, error: null }), // q-dead: no payment → delete
      deleteQuote, // delete q-dead
      makeBuilder({ data: { id: 'pay-1' }, error: null }), // q-paid: has payment → skip
      makeBuilder({ data: [{ id: 'd-orphan' }, { id: 'd-live' }], error: null }), // draft list
      makeBuilder({ data: null, error: null }), // d-orphan: no quotes left
      makeBuilder({ data: null, error: null }), // d-orphan: no payments
      deleteDraft, // delete d-orphan
      makeBuilder({ data: { id: 'q-open' }, error: null }), // d-live: open quote → skip
    ], []);

    const res = await cleanupDrafts(
      getJson('http://localhost/api/cron/cleanup-drafts', { authorization: 'Bearer s3cr3t' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, expiredQuotes: 1, deletedQuotes: 1, deletedDrafts: 1 });
    expect(deleteQuote.delete).toHaveBeenCalled();
    expect(deleteDraft.delete).toHaveBeenCalled();
  });
});
