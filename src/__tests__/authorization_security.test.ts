import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../lib/boardCache', () => ({
  invalidateBoardCache: vi.fn(),
}));
vi.mock('../lib/rateLimit', () => ({
  allowRequest: vi.fn(() => true),
  allowRequestDistributed: vi.fn(async () => true),
}));
vi.mock('../lib/dodo', () => ({
  createDodoCheckoutSession: vi.fn(),
}));
vi.mock('../lib/userSync', () => ({
  ensurePublicUser: vi.fn(),
}));

import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { GET as getProfile } from '../app/api/profile/[id]/route';
import { POST as postReactions, DELETE as deleteReactions, GET as getReactions } from '../app/api/reactions/route';
import { POST as postReport } from '../app/api/reports/route';
import { POST as postAuthSync } from '../app/api/auth/sync/route';
import { POST as postProfileUpdate } from '../app/api/profile/update/route';
import { POST as postProjectUpdate } from '../app/api/project/update/route';
import { POST as postPurchase } from '../app/api/purchase/create/route';
import { invalidateBoardCache } from '../lib/boardCache';
import { allowRequest } from '../lib/rateLimit';
import { createDodoCheckoutSession } from '../lib/dodo';
import { ensurePublicUser } from '../lib/userSync';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

type QueryResult = { data: any; error: any };

function makeBuilder(result: QueryResult) {
  const builder: any = {};
  for (const m of ['select', 'eq', 'neq', 'ilike', 'or', 'order', 'limit', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.__result = result;
  return builder;
}

function mockSessionUser(userId: string | null) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'Auth session missing!' },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: { success: true, count: 1, already_reacted: false }, error: null }),
  };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as any);
  return client;
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Two sequential from() calls: SEC-018 pre-read (select/eq/eq/maybeSingle),
// then the update (update/eq/eq/select). mockReset drops any leftover
// once-queue so both calls resolve deterministically per test.
type PreReadRow = { destination_url: string | null; moderation_status: string } | null;

function mockTwoStepCalls(preRead: PreReadRow, preReadError: { message: string } | null, updatedRows: unknown[]) {
  const pre: any = {
    select: vi.fn(() => pre),
    eq: vi.fn(() => pre),
    maybeSingle: vi.fn(() => Promise.resolve({ data: preRead, error: preReadError })),
  };
  const upd: any = {
    update: vi.fn(() => upd),
    eq: vi.fn(() => upd),
    select: vi.fn(() => Promise.resolve({ data: updatedRows, error: null })),
  };
  const from = vi.mocked(supabaseAdmin.from).mockReset();
  const queue = [pre, upd];
  from.mockImplementation(() => queue.shift() as any);
  return { pre, upd };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// /api/profile/[id] — SEC-006 (moderation/visibility) + SEC-020 (handle input)
// ---------------------------------------------------------------------------
describe('GET /api/profile/[id] (SEC-006/SEC-020)', () => {
  async function get(id: string) {
    return getProfile(new NextRequest(`http://localhost/api/profile/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it('returns 404 for malformed handles without touching the database (SEC-020)', async () => {
    const res = await get('bad!handle,or.injection');
    expect(res.status).toBe(404);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('serves approved+active projects publicly without a session', async () => {
    const builder = makeBuilder({
      data: [{
        id: UUID_A, user_id: UUID_B, moderation_status: 'approved', is_active: true,
        title: 'T', handle: 't', image_path: 'https://img.test/x.png', destination_url: 'https://x.test',
        current_rank: 1, current_active_value_minor: 1000, total_paid_minor: 1000,
        reactions_fire: 0, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0,
        categories: { name: 'AI' }, board_events: [],
      }],
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);
    mockSessionUser(null);

    const res = await get('some_handle');
    expect(res.status).toBe(200);
    expect(builder.or).toHaveBeenCalledWith('handle.eq.@some_handle,handle.eq.some_handle');
  });

  it('returns 404 for a suspended project to anonymous viewers (SEC-006)', async () => {
    const builder = makeBuilder({
      data: [{
        id: UUID_A, user_id: UUID_B, moderation_status: 'suspended', is_active: false,
        title: 'T', handle: 't', image_path: 'https://img.test/x.png', destination_url: 'https://x.test',
        current_rank: null, current_active_value_minor: 0, total_paid_minor: 0,
        reactions_fire: 0, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0,
        categories: null, board_events: [],
      }],
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);
    mockSessionUser(null);

    const res = await get('suspended_handle');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a suspended project to a different authenticated user (A→B)', async () => {
    const builder = makeBuilder({
      data: [{
        id: UUID_A, user_id: UUID_B, moderation_status: 'suspended', is_active: false,
        title: 'T', handle: 't', image_path: 'https://img.test/x.png', destination_url: 'https://x.test',
        current_rank: null, current_active_value_minor: 0, total_paid_minor: 0,
        reactions_fire: 0, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0,
        categories: null, board_events: [],
      }],
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);
    mockSessionUser(UUID_A); // viewer is A, owner is B

    const res = await get('suspended_handle');
    expect(res.status).toBe(404);
  });

  it('lets the owner fetch their own suspended/draft project', async () => {
    const builder = makeBuilder({
      data: [{
        id: UUID_A, user_id: UUID_A, moderation_status: 'suspended', is_active: false,
        title: 'T', handle: 't', image_path: 'https://img.test/x.png', destination_url: 'https://x.test',
        current_rank: null, current_active_value_minor: 0, total_paid_minor: 0,
        reactions_fire: 0, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0,
        categories: null, board_events: [],
      }],
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);
    mockSessionUser(UUID_A);

    const res = await get('suspended_handle');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/reactions — SEC-004 (session-bound RPC) + malformed ids
// ---------------------------------------------------------------------------
describe('/api/reactions (SEC-004)', () => {
  it('GET rejects malformed project ids before querying', async () => {
    const res = await getReactions(new NextRequest('http://localhost/api/reactions?projectId=not-a-uuid'));
    expect(res.status).toBe(400);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('POST rejects unauthenticated callers with 401', async () => {
    mockSessionUser(null);
    const res = await postReactions(jsonRequest('http://localhost/api/reactions', 'POST', { projectId: UUID_A, reaction: 'fire' }));
    expect(res.status).toBe(401);
  });

  it('POST rejects malformed target ids and never calls the RPC', async () => {
    const client = mockSessionUser(UUID_A);
    const res = await postReactions(jsonRequest('http://localhost/api/reactions', 'POST', { projectId: 'nope', reaction: 'fire' }));
    expect(res.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('POST issues the RPC on the SESSION client (auth.uid()-bound), not the service role', async () => {
    const client = mockSessionUser(UUID_A);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: { reactions_fire: 1, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0 }, error: null })
    );
    const res = await postReactions(jsonRequest('http://localhost/api/reactions', 'POST', { projectId: UUID_B, reaction: 'fire' }));
    expect(res.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith('add_project_reaction_auth', {
      p_project_id: UUID_B,
      p_user_id: UUID_A,
      p_reaction_type: 'fire',
    });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(invalidateBoardCache).toHaveBeenCalled();
  });

  it('DELETE issues the RPC on the SESSION client and rejects malformed ids', async () => {
    const client = mockSessionUser(UUID_A);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: { reactions_fire: 0, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0 }, error: null })
    );
    const bad = await deleteReactions(new NextRequest('http://localhost/api/reactions?projectId=zzz&reaction=fire', { method: 'DELETE' }));
    expect(bad.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();

    const ok = await deleteReactions(new NextRequest(`http://localhost/api/reactions?projectId=${UUID_B}&reaction=fire`, { method: 'DELETE' }));
    expect(ok.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith('remove_project_reaction_auth', {
      p_project_id: UUID_B,
      p_user_id: UUID_A,
      p_reaction_type: 'fire',
    });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /api/reports — malformed target id rejected pre-database
// ---------------------------------------------------------------------------
describe('POST /api/reports', () => {
  it('rejects malformed project ids with 400 (no insert attempted)', async () => {
    const res = await postReport(jsonRequest('http://localhost/api/reports', 'POST', {
      projectId: 'not-a-uuid',
      reason: 'spam',
      details: 'This is a report detail text.',
    }));
    expect(res.status).toBe(400);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /api/auth/sync — SEC-019 (no internal error echo)
// ---------------------------------------------------------------------------
describe('POST /api/auth/sync (SEC-019)', () => {
  it('returns a generic 500 without leaking internal error details', async () => {
    mockSessionUser(UUID_A);
    vi.mocked(ensurePublicUser).mockRejectedValue(new Error('secret internal postgres detail'));

    const res = await postAuthSync();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Sync failed');
    expect(JSON.stringify(body)).not.toContain('secret internal postgres detail');
  });

  it('returns 401 without a session', async () => {
    mockSessionUser(null);
    const res = await postAuthSync();
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// /api/profile/update — ownership is the session id; handle rules enforced
// ---------------------------------------------------------------------------
describe('POST /api/profile/update (SEC-010/SEC-026)', () => {
  it('returns 401 without a session', async () => {
    mockSessionUser(null);
    const res = await postProfileUpdate(jsonRequest('http://localhost/api/profile/update', 'POST', { bio: 'x' }));
    expect(res.status).toBe(401);
  });

  it('scopes the update to the session user id', async () => {
    mockSessionUser(UUID_A);
    const builder = makeBuilder({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockImplementation(() => builder as any);
    // load current
    builder.maybeSingle.mockResolvedValue({ data: { id: UUID_A, handle: 'alice', handle_last_changed_at: null, display_name: 'A', bio: null, avatar_url: null, website: null, twitter: null, github: null }, error: null });
    const updateResult = { data: [{ id: UUID_A, handle: 'alice', display_name: 'New', bio: 'bio', avatar_url: null, website: null, twitter: null, github: null, handle_last_changed_at: null }], error: null };
    builder.update.mockImplementation(() => {
      const b: any = {};
      b.eq = vi.fn().mockReturnValue(b);
      b.select = vi.fn().mockResolvedValue(updateResult);
      return b;
    });

    const res = await postProfileUpdate(jsonRequest('http://localhost/api/profile/update', 'POST', { display_name: 'New', bio: 'bio' }));
    expect(res.status).toBe(200);
    expect(builder.update).toHaveBeenCalledWith({ display_name: 'New', bio: 'bio' });
    const eqCalls = (builder.update as any).mock.results[0].value.eq.mock.calls;
    expect(eqCalls).toContainEqual(['id', UUID_A]);
  });

  it('rejects a handle change during the 30-day cooldown with 409', async () => {
    mockSessionUser(UUID_A);
    const builder = makeBuilder({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockImplementation(() => builder as any);
    builder.maybeSingle.mockResolvedValue({
      data: { id: UUID_A, handle: 'alice', handle_last_changed_at: new Date().toISOString(), display_name: 'A', bio: null, avatar_url: null, website: null, twitter: null, github: null },
      error: null,
    });

    const res = await postProfileUpdate(jsonRequest('http://localhost/api/profile/update', 'POST', { handle: 'newhandle' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.days_remaining).toBeGreaterThan(0);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid handle format with 400', async () => {
    mockSessionUser(UUID_A);
    const builder = makeBuilder({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockImplementation(() => builder as any);
    builder.maybeSingle.mockResolvedValue({
      data: { id: UUID_A, handle: 'alice', handle_last_changed_at: null, display_name: 'A', bio: null, avatar_url: null, website: null, twitter: null, github: null },
      error: null,
    });

    const res = await postProfileUpdate(jsonRequest('http://localhost/api/profile/update', 'POST', { handle: 'Bad Handle!' }));
    expect(res.status).toBe(400);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('rejects a taken handle with 409', async () => {
    mockSessionUser(UUID_A);
    const builder = makeBuilder({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockImplementation(() => builder as any);
    // current row (handle differs, no cooldown)
    builder.maybeSingle
      .mockResolvedValueOnce({ data: { id: UUID_A, handle: 'alice', handle_last_changed_at: null }, error: null })
      // uniqueness probe finds another owner
      .mockResolvedValueOnce({ data: { id: UUID_B }, error: null });

    const res = await postProfileUpdate(jsonRequest('http://localhost/api/profile/update', 'POST', { handle: 'taken_handle' }));
    expect(res.status).toBe(409);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('rejects a non-https website with 400', async () => {
    mockSessionUser(UUID_A);
    const builder = makeBuilder({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockImplementation(() => builder as any);
    builder.maybeSingle.mockResolvedValue({ data: { id: UUID_A, handle: 'alice', handle_last_changed_at: null }, error: null });

    const res = await postProfileUpdate(jsonRequest('http://localhost/api/profile/update', 'POST', { website: 'javascript:alert(1)' }));
    expect(res.status).toBe(400);
    expect(builder.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /api/project/update — ownership enforced via WHERE clause (IDOR A→B)
// ---------------------------------------------------------------------------
describe('POST /api/project/update (SEC-010/IDOR)', () => {
  it('returns 401 without a session', async () => {
    mockSessionUser(null);
    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', { projectId: UUID_A, title: 'x' }));
    expect(res.status).toBe(401);
  });

  it('scopes the update to session user and 404s when the project is not theirs', async () => {
    mockSessionUser(UUID_A);
    const builder: any = {};
    builder.update = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.select = vi.fn().mockResolvedValue({ data: [], error: null }); // A owns nothing
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_B, title: 'Stolen title',
    }));
    expect(res.status).toBe(404);
    expect(builder.eq).toHaveBeenCalledWith('id', UUID_B);
    expect(builder.eq).toHaveBeenCalledWith('user_id', UUID_A);
  });

  it('updates owned projects and returns the row', async () => {
    mockSessionUser(UUID_A);
    const { upd } = mockTwoStepCalls(
      { destination_url: 'https://x.test', moderation_status: 'approved' },
      null,
      [{ id: UUID_A, title: 'New', handle: 'h', destination_url: 'https://x.test', image_path: 'https://img.test/x.png', moderation_status: 'approved' }]
    );

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_A, title: 'New', destination_url: 'https://x.test',
    }));
    expect(res.status).toBe(200);
    expect(upd.update).toHaveBeenCalledWith({ title: 'New', destination_url: 'https://x.test' });
    expect(upd.eq).toHaveBeenCalledWith('user_id', UUID_A);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('rejects javascript:/http image and destination schemes with 400', async () => {
    mockSessionUser(UUID_A);
    const builder: any = {};
    builder.update = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.select = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder);

    const badImage = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_A, image_path: 'javascript:alert(1)',
    }));
    expect(badImage.status).toBe(400);

    const badLink = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_A, destination_url: 'javascript:alert(1)',
    }));
    expect(badLink.status).toBe(400);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('rejects a request with no updatable fields', async () => {
    mockSessionUser(UUID_A);
    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', { projectId: UUID_A }));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /api/project/update — SEC-018: a URL change voids the existing approval
// ---------------------------------------------------------------------------
describe('POST /api/project/update (SEC-018 URL re-pending)', () => {
  it('re-pends an approved project when the URL changes and recalculates ranks', async () => {
    mockSessionUser(UUID_A);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);
    const { pre, upd } = mockTwoStepCalls(
      { destination_url: 'https://old.example.com', moderation_status: 'approved' },
      null,
      [{ id: UUID_A, title: 'T', handle: 't', destination_url: 'https://new.example.com', image_path: 'https://img.test/x.png', moderation_status: 'pending' }]
    );

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_A, destination_url: 'https://new.example.com',
    }));

    expect(res.status).toBe(200);
    expect(pre.eq).toHaveBeenCalledWith('id', UUID_A);
    expect(pre.eq).toHaveBeenCalledWith('user_id', UUID_A);
    expect(upd.update).toHaveBeenCalledWith({
      destination_url: 'https://new.example.com',
      moderation_status: 'pending',
      is_active: false,
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('recalculate_board_ranks');
    const body = await res.json();
    expect(body.project.moderation_status).toBe('pending');
  });

  it('does not re-pend when the URL is unchanged after normalization', async () => {
    mockSessionUser(UUID_A);
    const { upd } = mockTwoStepCalls(
      { destination_url: 'https://x.test', moderation_status: 'approved' },
      null,
      [{ id: UUID_A, title: 'T', handle: 't', destination_url: 'https://x.test', image_path: 'https://img.test/x.png', moderation_status: 'approved' }]
    );

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_A, destination_url: 'x.test',
    }));

    expect(res.status).toBe(200);
    expect(upd.update).toHaveBeenCalledWith({ destination_url: 'https://x.test' });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it.each(['suspended', 'rejected', 'pending'] as const)(
    'leaves a %s project untouched on URL change (approved-only rule)',
    async (status) => {
      mockSessionUser(UUID_A);
      const { upd } = mockTwoStepCalls(
        { destination_url: 'https://old.example.com', moderation_status: status },
        null,
        [{ id: UUID_A, title: 'T', handle: 't', destination_url: 'https://new.example.com', image_path: 'https://img.test/x.png', moderation_status: status }]
      );

      const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
        projectId: UUID_A, destination_url: 'https://new.example.com',
      }));

      expect(res.status).toBe(200);
      expect(upd.update).toHaveBeenCalledWith({ destination_url: 'https://new.example.com' });
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    }
  );

  it('404s without writing when the pre-read finds no owned project (IDOR)', async () => {
    mockSessionUser(UUID_A);
    const { upd } = mockTwoStepCalls(null, null, []);

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_B, destination_url: 'https://new.example.com',
    }));

    expect(res.status).toBe(404);
    expect(upd.update).not.toHaveBeenCalled();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('returns 500 without writing when the pre-read fails', async () => {
    mockSessionUser(UUID_A);
    const { upd } = mockTwoStepCalls(null, { message: 'connection reset' }, []);

    const res = await postProjectUpdate(jsonRequest('http://localhost/api/project/update', 'POST', {
      projectId: UUID_A, destination_url: 'https://new.example.com',
    }));

    expect(res.status).toBe(500);
    expect(upd.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /api/purchase/create — ownership filter on top-up; handle block removed
// ---------------------------------------------------------------------------
describe('POST /api/purchase/create (IDOR/SEC-026)', () => {
  it('rejects a top-up against another user project (ownership WHERE filter)', async () => {
    mockSessionUser(UUID_A);
    const projects = makeBuilder({ data: null, error: null }); // not owned → null
    const categories = makeBuilder({ data: { id: UUID_B }, error: null });
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'users') return makeBuilder({ data: { id: UUID_A, handle: 'alice' }, error: null });
      if (table === 'projects') return projects;
      if (table === 'categories') return categories;
      return makeBuilder({ data: null, error: null });
    });

    const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', 'POST', {
      mode: 'top_up',
      projectId: UUID_B,
      topUpAmount: 10,
      targetRank: 50,
      title: 'T',
      handle: 'alice',
      linkUrl: 'https://x.test',
      imageUrl: 'https://img.test/x.png',
      category: 'AI',
    }));

    expect(res.status).toBe(403);
    expect(projects.eq).toHaveBeenCalledWith('user_id', UUID_A);
    expect(allowRequest).toHaveBeenCalled();
  });

  it('never updates an existing user handle during checkout (SEC-026) and sanitizes new handles', async () => {
    mockSessionUser(UUID_A);
    const users = makeBuilder({ data: null, error: null }); // new user → insert path
    users.insert = vi.fn().mockReturnValue(users);
    users.select = vi.fn().mockReturnValue(users);
    users.single = vi.fn().mockResolvedValue({ data: { id: UUID_A }, error: null });
    users.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const categories = makeBuilder({ data: { id: UUID_B }, error: null });
    const projects = makeBuilder({ data: { id: UUID_B }, error: null });
    projects.insert = vi.fn().mockReturnValue(projects);
    projects.select = vi.fn().mockReturnValue(projects);
    projects.single = vi.fn().mockResolvedValue({ data: { id: UUID_B }, error: null });
    const quotes = makeBuilder({ data: { id: UUID_A }, error: null });
    quotes.insert = vi.fn().mockReturnValue(quotes);
    quotes.select = vi.fn().mockReturnValue(quotes);
    quotes.single = vi.fn().mockResolvedValue({ data: { id: UUID_A }, error: null });
    const targets = makeBuilder({ data: null, error: null });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'users') return users;
      if (table === 'categories') return categories;
      if (table === 'projects') return projects;
      if (table === 'purchase_quotes') return quotes;
      return targets;
    });
    vi.mocked(createDodoCheckoutSession).mockResolvedValue({
      checkoutUrl: 'https://checkout.test', sessionId: 'cs_1',
    } as any);

    const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', 'POST', {
      mode: 'new',
      topUpAmount: 10,
      targetRank: 50,
      title: 'My Project',
      handle: '!!Bad Handle!!',
      linkUrl: 'https://x.test',
      imageUrl: 'https://img.test/x.png',
      category: 'AI',
    }));

    expect(res.status).toBe(200);
    expect(users.update).not.toHaveBeenCalled(); // handle-update block removed
    const insertedUser = users.insert.mock.calls[0][0];
    expect(insertedUser.handle).toMatch(/^[a-z0-9_]{2,30}$/);
    const insertedProject = projects.insert.mock.calls[0][0];
    expect(insertedProject.handle).toMatch(/^[a-z0-9_]{2,30}$/);
  });
});
