import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// SEC-018 real-handler suite. Every test exercises the actual route handlers
// (profile visibility, board query contract, update anti-bypass, checkout
// creation) — the assertions never re-implement the logic under test.
// ---------------------------------------------------------------------------
vi.mock('../../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../../lib/rateLimit', () => ({
  allowRequest: vi.fn(() => true),
  allowRequestDistributed: vi.fn(async () => true),
}));
vi.mock('../../lib/dodo', () => ({
  createDodoCheckoutSession: vi.fn(async () => ({
    checkoutUrl: 'https://pay.test/session',
    sessionId: 'sess_test_1',
  })),
}));

import { supabaseAdmin } from '../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { createDodoCheckoutSession } from '../../lib/dodo';
import { GET as getProfile } from '../../app/api/profile/[id]/route';
import { GET as getBoard } from '../../app/api/board/route';
import { POST as postProjectUpdate } from '../../app/api/project/update/route';
import { POST as postPurchase } from '../../app/api/purchase/create/route';
import { makeBuilder, mockTables, builders } from './helpers';

const UUID_OWNER = '11111111-1111-4111-8111-111111111111';
const UUID_STRANGER = '22222222-2222-4222-8222-222222222222';
const UUID_PROJECT = '33333333-3333-4333-8333-333333333333';

function mockSessionUser(userId: string | null, appMetadata: Record<string, unknown> = {}) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId, app_metadata: appMetadata, user_metadata: {} } : null },
        error: userId ? null : { message: 'Auth session missing!' },
      }),
    },
  };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as any);
  return client;
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_PROJECT,
    user_id: UUID_OWNER,
    moderation_status: 'pending',
    is_active: false,
    ranking_sequence: 1,
    title: 'Draft',
    handle: 'draft',
    image_path: 'https://img.test/x.png',
    destination_url: 'https://x.test',
    current_rank: null,
    current_active_value_minor: 0,
    total_paid_minor: 0,
    reactions_fire: 0,
    reactions_eyes: 0,
    reactions_heart: 0,
    reactions_laugh: 0,
    total_reactions: 0,
    categories: null,
    board_events: [],
    ...overrides,
  };
}

async function getProfileById() {
  return getProfile(new NextRequest('http://localhost/api/profile/anything'), {
    params: Promise.resolve({ id: UUID_PROJECT }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('PURCHASES_PAUSED', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Pending-project profile visibility (SEC-006 / SEC-018)', () => {
  it('404s for anonymous viewers after consulting the session', async () => {
    mockSessionUser(null);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: [projectRow()], error: null })
    );

    const res = await getProfileById();
    expect(res.status).toBe(404);
    expect(createServerSupabaseClient).toHaveBeenCalled();
  });

  it('404s for a different signed-in user', async () => {
    mockSessionUser(UUID_STRANGER);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: [projectRow()], error: null })
    );

    const res = await getProfileById();
    expect(res.status).toBe(404);
  });

  it('200s for the owner of the pending project', async () => {
    mockSessionUser(UUID_OWNER);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: [projectRow()], error: null })
    );

    const res = await getProfileById();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Draft');
  });

  it('serves approved+active projects without consulting a session at all', async () => {
    mockSessionUser(null);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: [projectRow({ moderation_status: 'approved', is_active: true, current_rank: 1 })], error: null })
    );

    const res = await getProfileById();
    expect(res.status).toBe(200);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe('Public board query contract (SEC-006 / SEC-018)', () => {
  it('restricts the board to approved, active projects', async () => {
    const board = makeBuilder({ data: [], error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(board);

    const res = await getBoard(new NextRequest('http://localhost/api/board'));
    expect(res.status).toBe(200);
    expect(board.eq).toHaveBeenCalledWith('is_active', true);
    expect(board.eq).toHaveBeenCalledWith('moderation_status', 'approved');
    // docs/04:259-263: rows beyond the global top 100 (null current_rank) are
    // still served for the Directory Archive — no rank-null exclusion may return.
    expect(board.not).not.toHaveBeenCalled();
    expect(board.order).toHaveBeenCalledWith('current_active_value_minor', { ascending: false });
  });
});

describe('Project update anti-bypass (SEC-018)', () => {
  it('strips moderation/monetary fields from client update payloads', async () => {
    mockSessionUser(UUID_OWNER);
    const builder = makeBuilder({
      data: [projectRow({ moderation_status: 'pending' })],
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', {
      projectId: UUID_PROJECT,
      title: 'x',
      moderation_status: 'approved',
      is_active: true,
      current_rank: 1,
      current_active_value_minor: 999999,
      total_paid_minor: 999999,
    }));

    expect(res.status).toBe(200);
    expect(builder.update).toHaveBeenCalledWith({ title: 'x' });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

describe('Checkout creates pending drafts (SEC-018 initial state)', () => {
  it('inserts new projects with moderation_status pending and inactive', async () => {
    mockSessionUser(UUID_OWNER);
    mockTables(supabaseAdmin.from, {
      system_state: { data: null, error: null },
      users: { data: { id: UUID_OWNER, handle: 'alice' }, error: null },
      categories: { data: { id: 'cat-1' }, error: null },
      projects: { data: { id: UUID_PROJECT }, error: null },
      purchase_quotes: { data: { id: 'quote-1' }, error: null },
    });

    const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', {
      mode: 'new',
      topUpAmount: 10,
      targetRank: 50,
      title: 'New DeFi Protocol',
      handle: 'alice',
      linkUrl: 'https://newdefi.example.com',
      imageUrl: 'https://img.test/x.png',
      category: 'AI',
    }));

    expect(res.status).toBe(200);
    expect(builders.projects.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: UUID_OWNER,
      moderation_status: 'pending',
      is_active: false,
    }));
    expect(createDodoCheckoutSession).toHaveBeenCalled();
  });
});
