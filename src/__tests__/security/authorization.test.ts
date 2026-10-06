import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Adversarial authorization suite — unauthenticated callers, forged role
// claims, and identity binding on authenticated mutations. The invariant:
// a request that fails auth must never reach the service-role layer.
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
import { GET as getOverview } from '../../app/api/admin/overview/route';
import { POST as postModerate } from '../../app/api/admin/moderate/route';
import { POST as postEmergency } from '../../app/api/admin/emergency/route';
import { POST as postPurchase } from '../../app/api/purchase/create/route';
import { POST as postProfileUpdate } from '../../app/api/profile/update/route';
import { POST as postProjectUpdate } from '../../app/api/project/update/route';
import { POST as postReactions } from '../../app/api/reactions/route';
import { POST as postWarRoom } from '../../app/api/war-room/messages/route';
import {
  makeBuilder,
  expectNoServiceRoleUse,
  resetHelpers,
} from './helpers';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

type SessionUser = {
  id: string;
  email?: string;
  app_metadata?: any;
  user_metadata?: any;
} | null;

function mockAuth(user: SessionUser) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue(
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } }
      ),
    },
    rpc: vi
      .fn()
      .mockResolvedValue({ data: { success: true, count: 1, already_reacted: false }, error: null }),
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
// Unauthenticated access matrix — every privileged or identity-bearing route
// must reject before any service-role DB contact.
// ---------------------------------------------------------------------------
describe('unauthenticated access matrix', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['GET /api/admin/overview', () => getOverview()],
    ['POST /api/admin/moderate', () => postModerate(json('http://localhost/api/admin/moderate', {}))],
    ['POST /api/admin/emergency', () => postEmergency(json('http://localhost/api/admin/emergency', {}))],
    ['POST /api/purchase/create', () => postPurchase(json('http://localhost/api/purchase/create', {}))],
    ['POST /api/profile/update', () => postProfileUpdate(json('http://localhost/api/profile/update', {}))],
    ['POST /api/project/update', () => postProjectUpdate(json('http://localhost/api/project/update', {}))],
    ['POST /api/reactions', () => postReactions(json('http://localhost/api/reactions', { projectId: UUID_B, reaction: 'fire' }))],
    ['POST /api/war-room/messages', () => postWarRoom(json('http://localhost/api/war-room/messages', { message: 'hi' }))],
  ];

  it.each(cases)('%s without a session → 401 with zero service-role contact', async (_label, call) => {
    mockAuth(null);
    const res = await call();
    expect(res.status).toBe(401);
    expectNoServiceRoleUse();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Role forgery — user_metadata is attacker-writable client-side; only
// app_metadata (server-set) and ADMIN_EMAILS may grant admin.
// ---------------------------------------------------------------------------
describe('forged admin identity', () => {
  const forgeries: Array<[string, SessionUser, () => Promise<Response>]> = [
    [
      'user_metadata.role = super_admin claim',
      { id: UUID_A, email: 'user@x.test', app_metadata: {}, user_metadata: { role: 'super_admin' } },
      () => postEmergency(json('http://localhost/api/admin/emergency', { paused: true, reason: 'attacker pause attempt' })),
    ],
    [
      'app_metadata.role = owner (unknown role)',
      { id: UUID_A, email: 'user@x.test', app_metadata: { role: 'owner' }, user_metadata: {} },
      () => postModerate(json('http://localhost/api/admin/moderate', { projectId: UUID_B, status: 'suspended', reason: 'attacker suspension' })),
    ],
    [
      'lookalike email admin@example.com.evil.com',
      { id: UUID_A, email: 'admin@example.com.evil.com', app_metadata: {}, user_metadata: {} },
      () => getOverview(),
    ],
    [
      'lookalike email admin@example.com@evil.com',
      { id: UUID_A, email: 'admin@example.com@evil.com', app_metadata: {}, user_metadata: {} },
      () => postModerate(json('http://localhost/api/admin/moderate', { projectId: UUID_B, status: 'approved', reason: 'attacker approval' })),
    ],
  ];

  it.each(forgeries)('%s → 403, no service-role contact', async (_label, session, call) => {
    mockAuth(session);
    const res = await call();
    expect(res.status).toBe(403);
    expectNoServiceRoleUse();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Identity binding — the session, not the request body, decides who acts.
// ---------------------------------------------------------------------------
describe('authenticated mutation identity binding', () => {
  it('reaction RPC is bound to the session user; body-supplied identities are ignored', async () => {
    const client = mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {} });
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: { reactions_fire: 1, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0 }, error: null })
    );

    const res = await postReactions(
      json('http://localhost/api/reactions', {
        projectId: UUID_B,
        reaction: 'fire',
        user_id: UUID_B,
        p_user_id: UUID_B,
        actor: UUID_B,
      })
    );

    expect(res.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('add_project_reaction_auth', {
      p_project_id: UUID_B,
      p_user_id: UUID_A,
      p_reaction_type: 'fire',
    });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('profile update is scoped to the session user id', async () => {
    mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {} });
    const users = makeBuilder({
      data: { id: UUID_A, handle: 'tester', display_name: 'T', bio: '', avatar_url: null, website: null, twitter: null, github: null, handle_last_changed_at: null },
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
      expect(table).toBe('users');
      return users;
    }) as any);

    const res = await postProfileUpdate(
      json('http://localhost/api/profile/update', { bio: 'scoped write' })
    );

    expect(res.status).toBe(200);
    expect(users.eq).toHaveBeenCalledWith('id', UUID_A);
  });
});
