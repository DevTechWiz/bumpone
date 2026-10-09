import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks (adminAuth stays REAL — these tests exercise requireAdmin)
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../lib/dodo', () => ({
  createDodoCheckoutSession: vi.fn(),
}));

import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { createDodoCheckoutSession } from '../lib/dodo';
import { resetRateLimits } from '../lib/rateLimit';
import { requireAdmin } from '../lib/adminAuth';
import { isPurchasesPaused } from '../lib/pauseState';
import { POST as postEmergency } from '../app/api/admin/emergency/route';
import { GET as getOverview } from '../app/api/admin/overview/route';
import { POST as postModerate } from '../app/api/admin/moderate/route';
import { POST as postPurchase } from '../app/api/purchase/create/route';

const UUID_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_PROJECT = '11111111-1111-4111-8111-111111111111';

type QueryResult = { data: any; error: any; count?: number | null };

// Thenable builder: awaited chains (insert/upsert/update..select) resolve to
// the configured result, mirroring supabase-js's PostgrestBuilder.
function makeBuilder(result: QueryResult) {
  const builder: any = {};
  for (const m of ['select', 'eq', 'neq', 'ilike', 'or', 'order', 'not', 'lte', 'gt', 'in', 'is', 'insert', 'update', 'upsert', 'delete']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  builder.__result = result;
  return builder;
}

const tableCalls: string[] = [];
const builders: Record<string, any> = {};

function mockTables(tables: Record<string, QueryResult>) {
  tableCalls.length = 0;
  for (const k of Object.keys(builders)) delete builders[k];
  vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
    tableCalls.push(table);
    if (!(table in tables)) throw new Error(`unexpected table queried: ${table}`);
    builders[table] = makeBuilder(tables[table]);
    return builders[table];
  }) as any);
}

function mockAuthSession(user: { id: string; email?: string; app_metadata?: any; user_metadata?: any } | null) {
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
  mockAuthSession({ id: UUID_ADMIN, email: 'admin@example.com', app_metadata: { role: 'admin' } });
const plainSession = () =>
  mockAuthSession({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'nobody@x.test',
    app_metadata: {},
    user_metadata: { role: 'admin' },
  });

function jsonRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  tableCalls.length = 0;
  for (const k of Object.keys(builders)) delete builders[k];
  vi.stubEnv('PURCHASES_PAUSED', 'false');
  vi.stubEnv('ADMIN_EMAILS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// requireAdmin: authentication + role resolution (forgery must fail closed)
// ---------------------------------------------------------------------------
describe('requireAdmin', () => {
  it('returns Unauthenticated when there is no session', async () => {
    mockAuthSession(null);
    expect(await requireAdmin()).toEqual({ error: 'Unauthenticated' });
  });

  it('resolves super_admin from ADMIN_EMAILS case-insensitively', async () => {
    vi.stubEnv('ADMIN_EMAILS', ' Root@Example.com , other@x.test ');
    mockAuthSession({ id: UUID_ADMIN, email: 'root@example.com', app_metadata: {} });
    expect(await requireAdmin()).toEqual({ user: expect.objectContaining({ id: UUID_ADMIN }), role: 'super_admin' });
  });

  it('resolves admin from app_metadata (server-controlled, unforgeable)', async () => {
    mockAuthSession({ id: UUID_ADMIN, email: 'a@x.test', app_metadata: { role: 'admin' } });
    expect(await requireAdmin()).toEqual({ user: expect.objectContaining({ id: UUID_ADMIN }), role: 'admin' });
  });

  it('rejects a user_metadata role forgery (client-writable) with Forbidden', async () => {
    mockAuthSession({ id: UUID_ADMIN, email: 'a@x.test', app_metadata: {}, user_metadata: { role: 'admin' } });
    expect(await requireAdmin()).toEqual({ error: 'Forbidden' });
  });

  it('rejects a non-listed email with empty app_metadata with Forbidden', async () => {
    mockAuthSession({ id: UUID_ADMIN, email: 'nobody@x.test', app_metadata: {} });
    expect(await requireAdmin()).toEqual({ error: 'Forbidden' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/emergency: runtime killswitch (SEC-005) + audit integrity
// ---------------------------------------------------------------------------
describe('POST /api/admin/emergency', () => {
  it('returns 401 without a session', async () => {
    mockAuthSession(null);
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'incident' }));
    expect(res.status).toBe(401);
    expect(tableCalls).toHaveLength(0);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    plainSession();
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'incident' }));
    expect(res.status).toBe(403);
    expect(tableCalls).toHaveLength(0);
  });

  it('returns 400 without a reason and touches no table', async () => {
    adminSession();
    mockTables({});
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true }));
    expect(res.status).toBe(400);
    expect(tableCalls).toHaveLength(0);
  });

  it('applies the state change BEFORE auditing, with reason and metadata', async () => {
    adminSession();
    mockTables({
      system_state: { data: null, error: null },
      admin_audit_log: { data: null, error: null },
    });
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'payment incident #1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, purchases_paused: true });
    // state first, audit second — the log can never claim an action that failed
    expect(tableCalls).toEqual(['system_state', 'admin_audit_log']);
    expect(builders.system_state.upsert).toHaveBeenCalledWith({
      id: 'global',
      purchases_paused: true,
      updated_by: UUID_ADMIN,
    });
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_user_id: UUID_ADMIN,
        action: 'purchases_paused',
        target_type: 'system',
        target_id: 'global',
        reason: 'payment incident #1',
        metadata: { purchases_paused: true },
      })
    );
  });

  it('logs purchases_resumed with the supplied reason on resume', async () => {
    adminSession();
    mockTables({
      system_state: { data: null, error: null },
      admin_audit_log: { data: null, error: null },
    });
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: false, reason: 'incident resolved' }));
    expect(res.status).toBe(200);
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchases_resumed', reason: 'incident resolved' })
    );
  });

  it('returns 500 and writes NO audit row when the state update fails', async () => {
    adminSession();
    mockTables({
      system_state: { data: null, error: { message: 'connection lost' } },
    });
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'payment incident' }));
    expect(res.status).toBe(500);
    expect(tableCalls).toEqual(['system_state']);
  });

  it('still returns success when the audit insert fails (state already applied) but logs the gap', async () => {
    adminSession();
    mockTables({
      system_state: { data: null, error: null },
      admin_audit_log: { data: null, error: { message: 'audit insert failed' } },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'payment incident' }));
      expect(res.status).toBe(200);
      expect(errSpy).toHaveBeenCalledWith('admin audit insert failed:', 'audit insert failed');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('enforces the per-admin request budget (429)', async () => {
    adminSession();
    mockTables({
      system_state: { data: null, error: null },
      admin_audit_log: { data: null, error: null },
    });
    for (let i = 0; i < 30; i++) {
      const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'payment incident' }));
      expect(res.status).toBe(200);
    }
    const res = await postEmergency(jsonRequest('http://localhost/api/admin/emergency', { paused: true, reason: 'payment incident' }));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/overview: reports the REAL pause state
// ---------------------------------------------------------------------------
describe('GET /api/admin/overview', () => {
  const overviewTables = (): Record<string, QueryResult> => ({
    projects: { data: null, error: null, count: 3 },
    reports: { data: null, error: null, count: 1 },
    payments: { data: [{ amount_minor: 1500 }], error: null },
    purchase_quotes: { data: null, error: null, count: 0 },
    system_state: { data: { purchases_paused: true }, error: null },
  });

  it('reports purchasesPaused=true from system_state', async () => {
    adminSession();
    mockTables(overviewTables());
    const res = await getOverview();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.purchasesPaused).toBe(true);
    expect(body.totalRevenue).toBe(15);
    expect(tableCalls).toContain('system_state');
  });

  it('lets the deploy-level env var force paused without querying the database', async () => {
    vi.stubEnv('PURCHASES_PAUSED', 'true');
    adminSession();
    mockTables(overviewTables());
    const res = await getOverview();
    const body = await res.json();
    expect(body.purchasesPaused).toBe(true);
    expect(tableCalls).not.toContain('system_state');
  });

  it('returns 403 for an authenticated non-admin', async () => {
    plainSession();
    mockTables({});
    const res = await getOverview();
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/purchase/create: checkout creation respects the killswitch
// ---------------------------------------------------------------------------
describe('POST /api/purchase/create killswitch', () => {
  const body = {
    mode: 'top_up',
    projectId: UUID_PROJECT,
    topUpAmount: 10,
    targetRank: 50,
    title: 'T',
    handle: 'alice',
    linkUrl: 'https://x.test',
    imageUrl: 'https://img.test/x.png',
    category: 'AI',
  };

  it('returns 503 when paused and never touches checkout tables', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: UUID_ADMIN } }, error: null }) },
    } as any);
    mockTables({ system_state: { data: { purchases_paused: true }, error: null } });
    const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', body));
    expect(res.status).toBe(503);
    expect(tableCalls).toEqual(['system_state']);
    expect(createDodoCheckoutSession).not.toHaveBeenCalled();
  });

  it('passes the gate when unpaused and proceeds to normal validation', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: UUID_ADMIN } }, error: null }) },
    } as any);
    mockTables({
      system_state: { data: { purchases_paused: false }, error: null },
      users: { data: { id: UUID_ADMIN, handle: 'alice' }, error: null },
      categories: { data: null, error: null },
    });
    const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', body));
    // unpaused → pause gate passed → users row read → unknown category → 400
    expect(tableCalls[0]).toBe('system_state');
    expect(tableCalls).toContain('users');
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(503);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/moderate: privileged moderation + audit integrity
// ---------------------------------------------------------------------------
describe('POST /api/admin/moderate', () => {
  const modBody = { projectId: UUID_PROJECT, status: 'approved', reason: 'looks legit' };

  it('returns 401 without a session', async () => {
    mockAuthSession(null);
    const res = await postModerate(jsonRequest('http://localhost/api/admin/moderate', modBody));
    expect(res.status).toBe(401);
    expect(tableCalls).toHaveLength(0);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    plainSession();
    const res = await postModerate(jsonRequest('http://localhost/api/admin/moderate', modBody));
    expect(res.status).toBe(403);
    expect(tableCalls).toHaveLength(0);
  });

  it('returns 400 for a non-uuid project id without touching the database', async () => {
    adminSession();
    mockTables({});
    const res = await postModerate(jsonRequest('http://localhost/api/admin/moderate', { ...modBody, projectId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(tableCalls).toHaveLength(0);
  });

  it('returns 404 for an unknown project and records no audit row or rank recalculation', async () => {
    adminSession();
    mockTables({ projects: { data: [], error: null } });
    const res = await postModerate(jsonRequest('http://localhost/api/admin/moderate', modBody));
    expect(res.status).toBe(404);
    expect(tableCalls).toEqual(['projects']);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('updates, recalculates ranks, and audits with reason + metadata on success', async () => {
    adminSession();
    mockTables({
      projects: { data: [{ id: UUID_PROJECT }], error: null },
      admin_audit_log: { data: null, error: null },
    });
    const res = await postModerate(jsonRequest('http://localhost/api/admin/moderate', modBody));
    expect(res.status).toBe(200);
    expect(builders.projects.update).toHaveBeenCalledWith({ moderation_status: 'approved', is_active: true });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('recalculate_board_ranks');
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_user_id: UUID_ADMIN,
        action: 'project_approved',
        target_type: 'project',
        target_id: UUID_PROJECT,
        reason: 'looks legit',
        metadata: { moderation_status: 'approved' },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isPurchasesPaused: two-layer OR with fail-open read
// ---------------------------------------------------------------------------
describe('isPurchasesPaused', () => {
  it('honors the deploy-level env var without any database read', async () => {
    vi.stubEnv('PURCHASES_PAUSED', 'true');
    mockTables({});
    expect(await isPurchasesPaused()).toBe(true);
    expect(tableCalls).toHaveLength(0);
  });

  it('reads the runtime flag from system_state', async () => {
    mockTables({ system_state: { data: { purchases_paused: true }, error: null } });
    expect(await isPurchasesPaused()).toBe(true);
  });

  it('returns false when the row says unpaused', async () => {
    mockTables({ system_state: { data: { purchases_paused: false }, error: null } });
    expect(await isPurchasesPaused()).toBe(false);
  });

  it('fails open (false) on a read error and logs it', async () => {
    mockTables({ system_state: { data: null, error: { message: 'read failed' } } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await isPurchasesPaused()).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('pause state read failed:', 'read failed');
    } finally {
      errSpy.mockRestore();
    }
  });
});
