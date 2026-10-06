import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Adversarial content suite — control/bidi characters must be stripped before
// any value is persisted (display surfaces, admin audit log) and hostile
// string lengths must fail validation.
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
import { createDodoCheckoutSession } from '../../lib/dodo';
import { resetRateLimits } from '../../lib/rateLimit';
import { POST as postProfileUpdate } from '../../app/api/profile/update/route';
import { POST as postPurchase } from '../../app/api/purchase/create/route';
import { POST as postEmergency } from '../../app/api/admin/emergency/route';
import { POST as postModerate } from '../../app/api/admin/moderate/route';
import { mockTables, tableCalls, builders, resetHelpers } from './helpers';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_P = '22222222-2222-4222-8222-222222222222';
const UUID_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const CONTROL = /[\u0000-\u0008\u000E-\u001F\u200E-\u200F\u202A-\u202E\u2066-\u2069]/;

function mockAuth(user: { id: string; email?: string; app_metadata?: any; user_metadata?: any } | null) {
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
    body: JSON.stringify(body),
  });
}

const PROFILE_ROW = {
  id: UUID_A,
  handle: 'tester',
  display_name: 'Tester',
  bio: '',
  avatar_url: null,
  website: null,
  twitter: null,
  github: null,
  handle_last_changed_at: null,
};

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
// Profile fields (SEC-031) — strip before length validation, persist clean.
// ---------------------------------------------------------------------------
describe('POST /api/profile/update control-character stripping', () => {
  beforeEach(() => mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {} }));

  it('strips RLO and C0 controls from bio before persisting', async () => {
    mockTables(vi.mocked(supabaseAdmin.from), { users: { data: PROFILE_ROW, error: null } });
    const res = await postProfileUpdate(
      json('http://localhost/api/profile/update', { bio: '\u202Eadmin\u0007 portal \u202Elogin' })
    );
    expect(res.status).toBe(200);
    expect(builders.users.update).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'admin portal login' })
    );
  });

  it('strips control/bidi chars from display_name before persisting', async () => {
    mockTables(vi.mocked(supabaseAdmin.from), { users: { data: PROFILE_ROW, error: null } });
    const res = await postProfileUpdate(
      json('http://localhost/api/profile/update', { display_name: 'Ad\u202Emin\u0007 Name' })
    );
    expect(res.status).toBe(200);
    expect(builders.users.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Admin Name' })
    );
  });

  it('rejects a display_name that is only control characters (strips to empty)', async () => {
    mockTables(vi.mocked(supabaseAdmin.from), { users: { data: PROFILE_ROW, error: null } });
    const res = await postProfileUpdate(
      json('http://localhost/api/profile/update', { display_name: '\u0007\u200E\u202E' })
    );
    expect(res.status).toBe(400);
    expect(tableCalls).toEqual([]);
  });

  it('rejects a bio above 500 characters after stripping', async () => {
    mockTables(vi.mocked(supabaseAdmin.from), { users: { data: PROFILE_ROW, error: null } });
    const res = await postProfileUpdate(
      json('http://localhost/api/profile/update', { bio: '\u0007'.repeat(50) + 'x'.repeat(501) })
    );
    expect(res.status).toBe(400);
    expect(tableCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Checkout content (SEC-031) — project title stripped; user display_name
// derived from hostile auth metadata is stripped before insertion.
// ---------------------------------------------------------------------------
describe('POST /api/purchase/create content stripping', () => {
  it('strips title and metadata-derived display_name before persisting', async () => {
    mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {}, user_metadata: { full_name: 'Ev\u202Eil\u0007 Name' } });

    const usersB: any = {};
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) usersB[m] = vi.fn(() => usersB);
    usersB.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    usersB.single = vi.fn().mockResolvedValue({ data: { id: UUID_A }, error: null });

    const categoriesB: any = {};
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) categoriesB[m] = vi.fn(() => categoriesB);
    categoriesB.maybeSingle = vi.fn().mockResolvedValue({ data: { id: UUID_P }, error: null });
    categoriesB.single = vi.fn().mockResolvedValue({ data: { id: UUID_P }, error: null });

    const projectsB: any = {};
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) projectsB[m] = vi.fn(() => projectsB);
    projectsB.single = vi.fn().mockResolvedValue({ data: { id: UUID_P }, error: null });
    projectsB.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const quotesB: any = {};
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) quotesB[m] = vi.fn(() => quotesB);
    quotesB.single = vi.fn().mockResolvedValue({ data: { id: UUID_A }, error: null });

    const otherB: any = {};
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) otherB[m] = vi.fn(() => otherB);
    otherB.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    otherB.single = vi.fn().mockResolvedValue({ data: { id: UUID_A }, error: null });

    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
      tableCalls.push(table);
      if (table === 'users') return usersB;
      if (table === 'categories') return categoriesB;
      if (table === 'projects') return projectsB;
      if (table === 'purchase_quotes') return quotesB;
      return otherB;
    }) as any);
    vi.mocked(createDodoCheckoutSession).mockResolvedValue({
      checkoutUrl: 'https://checkout.test',
      sessionId: 'cs_1',
    } as any);

    const res = await postPurchase(
      json('http://localhost/api/purchase/create', {
        mode: 'new',
        topUpAmount: 10,
        targetRank: 50,
        title: 'Bo\u0007ost\u202E',
        handle: 'tester',
        linkUrl: 'https://x.test',
        imageUrl: 'https://img.test/x.png',
        category: 'AI',
      })
    );

    expect(res.status).toBe(200);
    const insertedProject = projectsB.insert.mock.calls[0][0];
    expect(insertedProject.title).toBe('Boost');
    expect(insertedProject.title).not.toMatch(CONTROL);
    const insertedUser = usersB.insert.mock.calls[0][0];
    expect(insertedUser.display_name).toBe('Evil Name');
    expect(insertedUser.display_name).not.toMatch(CONTROL);
  });

  it('rejects a title that is only control characters before any table work', async () => {
    mockAuth({ id: UUID_A, email: 'a@x.test', app_metadata: {} });
    const res = await postPurchase(
      json('http://localhost/api/purchase/create', {
        mode: 'new',
        topUpAmount: 10,
        targetRank: 50,
        title: '\u0007\u200E\u202E',
        handle: 'tester',
        linkUrl: 'https://x.test',
        imageUrl: 'https://img.test/x.png',
        category: 'AI',
      })
    );
    expect(res.status).toBe(400);
    expect(tableCalls.filter((t) => t !== 'system_state')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Admin audit reasons (SEC-031) — the immutable log must never store
// terminal escapes or invisible text; state change precedes audit write.
// ---------------------------------------------------------------------------
describe('admin audit reasons are stripped and state precedes audit', () => {
  it('emergency pause stores a clean reason with system_state written first', async () => {
    adminSession();
    mockTables(vi.mocked(supabaseAdmin.from), {
      system_state: { data: null, error: null },
      admin_audit_log: { data: null, error: null },
    });

    const res = await postEmergency(
      json('http://localhost/api/admin/emergency', { paused: true, reason: 'inc\u0007ident \u202E#7' })
    );

    expect(res.status).toBe(200);
    const auditInsert = builders.admin_audit_log.insert.mock.calls[0][0];
    expect(auditInsert.reason).toBe('incident #7');
    expect(auditInsert.reason).not.toMatch(CONTROL);
    expect(tableCalls.indexOf('system_state')).toBeLessThan(tableCalls.indexOf('admin_audit_log'));
  });

  it('moderation stores a clean reason in the audit log', async () => {
    adminSession();
    mockTables(vi.mocked(supabaseAdmin.from), {
      projects: { data: [{ id: UUID_P }], error: null },
      admin_audit_log: { data: null, error: null },
    });
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await postModerate(
      json('http://localhost/api/admin/moderate', {
        projectId: UUID_P,
        status: 'suspended',
        reason: 'ban \u0007\u202Enow',
      })
    );

    expect(res.status).toBe(200);
    const auditInsert = builders.admin_audit_log.insert.mock.calls[0][0];
    expect(auditInsert.reason).toBe('ban now');
    expect(auditInsert.reason).not.toMatch(CONTROL);
  });
});
