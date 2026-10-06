import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks (mirrors authorization_security.test.ts)
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../lib/boardCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/boardCache')>();
  return { ...actual, invalidateBoardCache: vi.fn() };
});
vi.mock('../lib/dodo', () => ({
  createDodoCheckoutSession: vi.fn(),
}));
vi.mock('../lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { requireAdmin } from '../lib/adminAuth';
import {
  allowRequest,
  resetRateLimits,
  rateLimitKeyCount,
  MAX_RATE_LIMIT_KEYS,
} from '../lib/rateLimit';
import {
  clientIp,
  readJsonWithLimit,
  bodyTooLarge,
} from '../lib/requestGuard';
import { setBoardCache, boardMemoryCache, MAX_CACHE_ENTRIES, invalidateBoardCache } from '../lib/boardCache';
import { GET as getBoard } from '../app/api/board/route';
import { POST as postPurchase } from '../app/api/purchase/create/route';
import { POST as postReactions } from '../app/api/reactions/route';
import { POST as postChat } from '../app/api/war-room/messages/route';
import { POST as postReport } from '../app/api/reports/route';
import { POST as postEmergency } from '../app/api/admin/emergency/route';
import { buildContentSecurityPolicy } from '../middleware';

const UUID_A = '11111111-1111-4111-8111-111111111111';

type QueryResult = { data: any; error: any };

function makeBuilder(result: QueryResult) {
  const builder: any = {};
  for (const m of ['select', 'eq', 'neq', 'ilike', 'or', 'order', 'limit', 'insert', 'update', 'delete', 'not', 'lte', 'gt', 'in']) {
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

function jsonRequest(url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const VALID_PURCHASE_BODY = {
  mode: 'top_up',
  projectId: UUID_A,
  topUpAmount: 10,
  targetRank: 50,
  title: 'T',
  handle: 'alice',
  linkUrl: 'https://x.test',
  imageUrl: 'https://img.test/x.png',
  category: 'AI',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Rate limiter: eviction, bounded key space, identity (SEC-007/SEC-021)
// ---------------------------------------------------------------------------
describe('rate limiter hardening (SEC-007)', () => {
  it('blocks the request after the budget and resets after the window', async () => {
    for (let i = 0; i < 3; i++) expect(allowRequest('k:window', 3, 50)).toBe(true);
    expect(allowRequest('k:window', 3, 50)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(allowRequest('k:window', 3, 50)).toBe(true);
  });

  it('never grows past MAX_RATE_LIMIT_KEYS (unbounded-map exhaustion closed)', () => {
    for (let i = 0; i < MAX_RATE_LIMIT_KEYS + 500; i++) {
      allowRequest(`exhaust:${i}`, 5, 60_000);
    }
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(MAX_RATE_LIMIT_KEYS);
  });

  it('prefers edge-set CF-Connecting-IP over client-controlled x-forwarded-for', () => {
    const spoofed = new NextRequest('http://localhost/api/reports', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': '10.0.0.1, 198.51.100.7',
      },
    });
    expect(clientIp(spoofed)).toBe('203.0.113.9');

    const noCf = new NextRequest('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
    });
    expect(clientIp(noCf)).toBe('198.51.100.7');

    expect(clientIp(new NextRequest('http://localhost/api/reports'))).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Request guard: oversized / malformed / wrong content type (SEC-008)
// ---------------------------------------------------------------------------
describe('request body guard (SEC-008)', () => {
  function reqWith(contentLength: string | undefined, body: string, contentType?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (contentLength !== undefined) headers['content-length'] = contentLength;
    if (contentType !== undefined) headers['content-type'] = contentType;
    return new NextRequest('http://localhost/api/x', { method: 'POST', headers, body });
  }

  it('rejects on declared content-length before reading the body', async () => {
    const res = await readJsonWithLimit(reqWith('999999999', '{}', 'application/json'), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(413);
  });

  it('rejects a chunked/undeclared body that exceeds the cap while streaming', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(4096) });
    const res = await readJsonWithLimit(reqWith(undefined, big, 'application/json'), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(413);
  });

  it('rejects a declared non-JSON content type', async () => {
    const res = await readJsonWithLimit(reqWith(undefined, '<html></html>', 'text/html'), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(415);
  });

  it('rejects malformed JSON with 400 (not an unhandled 500)', async () => {
    const res = await readJsonWithLimit(reqWith(undefined, '{"broken":', 'application/json'), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(400);
  });

  it('parses valid JSON under the cap', async () => {
    const res = await readJsonWithLimit(reqWith('15', '{"a":1}', 'application/json'), 1024);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ a: 1 });
  });

  it('detects oversized declared multipart bodies (uploads pre-check)', () => {
    const req = new NextRequest('http://localhost/api/uploads/image', {
      method: 'POST',
      headers: { 'content-length': String(10 * 1024 * 1024) },
      body: 'x',
    });
    expect(bodyTooLarge(req, 6 * 1024 * 1024)).toBe(true);
    expect(bodyTooLarge(req, 64 * 1024 * 1024)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid parameters: board sort/category whitelist (SEC-009)
// ---------------------------------------------------------------------------
describe('GET /api/board parameter validation (SEC-009)', () => {
  it('rejects unknown sort values with 400', async () => {
    const res = await getBoard(new NextRequest('http://localhost/api/board?sort=drop%20table'));
    expect(res.status).toBe(400);
  });

  it('rejects malformed category values with 400 (cache-key space bounded)', async () => {
    const res = await getBoard(new NextRequest('http://localhost/api/board?category=%3Cscript%3E'));
    expect(res.status).toBe(400);
  });

  it('accepts whitelisted sort and a well-formed category', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(makeBuilder({ data: [], error: null }) as any);
    const res = await getBoard(new NextRequest('http://localhost/api/board?sort=popular&category=Gaming&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sort).toBe('popular');
    expect(body.category).toBe('Gaming');
  });
});

// ---------------------------------------------------------------------------
// Board cache: hard entry cap (SEC-009)
// ---------------------------------------------------------------------------
describe('board cache entry cap (SEC-009)', () => {
  beforeEach(() => invalidateBoardCache());

  it('never exceeds MAX_CACHE_ENTRIES and evicts the oldest entry first', () => {
    for (let i = 0; i < MAX_CACHE_ENTRIES + 50; i++) {
      setBoardCache(`key-${i}`, {
        rawJson: '{}',
        data: {},
        timestamp: Date.now() + i,
        etag: `W/"${i}"`,
      });
    }
    expect(boardMemoryCache.size).toBeLessThanOrEqual(MAX_CACHE_ENTRIES);
    // the very first key (oldest timestamp) must have been evicted
    expect(boardMemoryCache.has('key-0')).toBe(false);
    expect(boardMemoryCache.has(`key-${MAX_CACHE_ENTRIES + 49}`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Repeated checkout creation (per-user 5/min)
// ---------------------------------------------------------------------------
describe('POST /api/purchase/create abuse (checkout flood)', () => {
  it('returns 429 on the 6th attempt within a minute', async () => {
    mockSessionUser(UUID_A);
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      throw new Error('downstream unavailable');
    });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', VALID_PURCHASE_BODY));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('keys the budget on the authenticated user, not the client IP', async () => {
    mockSessionUser(UUID_A);
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      throw new Error('downstream unavailable');
    });
    for (let i = 0; i < 5; i++) await postPurchase(jsonRequest('http://localhost/api/purchase/create', VALID_PURCHASE_BODY));

    // different user is unaffected by the first user's exhausted budget
    mockSessionUser('22222222-2222-4222-8222-222222222222');
    const res = await postPurchase(jsonRequest('http://localhost/api/purchase/create', VALID_PURCHASE_BODY));
    expect(res.status).not.toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Repeated reactions (per-user 60/min)
// ---------------------------------------------------------------------------
describe('POST /api/reactions abuse (reaction flood)', () => {
  it('returns 429 once the 60/min budget is exhausted', async () => {
    mockSessionUser(UUID_A);
    const projRow = { data: { reactions_fire: 1, reactions_eyes: 0, reactions_heart: 0, reactions_laugh: 0 }, error: null };
    vi.mocked(supabaseAdmin.from).mockReturnValue(makeBuilder(projRow) as any);

    let last = 0;
    for (let i = 0; i < 61; i++) {
      const res = await postReactions(jsonRequest('http://localhost/api/reactions', { projectId: UUID_A, reaction: 'fire' }));
      last = res.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Chat flooding (per-user 5/30s)
// ---------------------------------------------------------------------------
describe('POST /api/war-room/messages abuse (chat flood)', () => {
  it('returns 429 on the 6th message within 30 seconds', async () => {
    mockSessionUser(UUID_A);
    const messageRow = {
      id: 'm1', user_id: UUID_A, author_name: 'A', author_handle: '@a',
      avatar_color: 'bg-sky-500', text: 'hello', slot_tag: null, is_official: false,
      created_at: new Date().toISOString(),
    };
    vi.mocked(supabaseAdmin.from).mockImplementation(() => makeBuilder({ data: messageRow, error: null }) as any);

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await postChat(jsonRequest('http://localhost/api/war-room/messages', { text: `message ${i}` }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Report flooding (per-IP 5/hr, edge-set IP identity)
// ---------------------------------------------------------------------------
describe('POST /api/reports abuse (report flood)', () => {
  const validReport = {
    projectId: UUID_A,
    reason: 'spam',
    details: 'This is a report detail text.',
  };

  it('returns 429 on the 6th report from the same IP within an hour', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(makeBuilder({ data: null, error: null }) as any);

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await postReport(
        jsonRequest('http://localhost/api/reports', validReport, { 'cf-connecting-ip': '203.0.113.5' })
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('cannot be bypassed by spoofing x-forwarded-for when CF-Connecting-IP is present', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(makeBuilder({ data: null, error: null }) as any);

    for (let i = 0; i < 5; i++) {
      await postReport(jsonRequest('http://localhost/api/reports', validReport, { 'cf-connecting-ip': '203.0.113.6' }));
    }
    // 6th attempt spoofs a fresh x-forwarded-for hop but carries the same edge IP
    const res = await postReport(
      jsonRequest('http://localhost/api/reports', validReport, {
        'cf-connecting-ip': '203.0.113.6',
        'x-forwarded-for': '198.51.100.99',
      })
    );
    expect(res.status).toBe(429);

    // a genuinely different edge IP still gets a fresh budget
    const other = await postReport(
      jsonRequest('http://localhost/api/reports', validReport, { 'cf-connecting-ip': '203.0.113.7' })
    );
    expect(other.status).not.toBe(429);
  });

  it('rejects malformed JSON with 400 (no database insert)', async () => {
    const req = new NextRequest('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"projectId":',
    });
    const res = await postReport(req);
    expect(res.status).toBe(400);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Admin emergency: malformed JSON + per-admin budget
// ---------------------------------------------------------------------------
describe('POST /api/admin/emergency abuse', () => {
  it('returns 400 for malformed JSON instead of an unhandled 500', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: UUID_A }, role: 'super_admin' } as any);
    const req = new NextRequest('http://localhost/api/admin/emergency', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await postEmergency(req);
    expect(res.status).toBe(400);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CSP (SEC-011): enforced production-only; same-origin + inline scripts
// (prerendered inline flight scripts can never carry a per-request nonce)
// ---------------------------------------------------------------------------
describe('Content-Security-Policy (SEC-011)', () => {
  it('is not enforced outside production (dev/test never broken by it)', () => {
    expect(buildContentSecurityPolicy()).toBeNull();
  });

  it('produces an enforced policy in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const csp = buildContentSecurityPolicy();
    expect(csp).toBeTruthy();
    expect(csp!).toMatch(/script-src 'self' 'unsafe-inline'/);
    // a nonce here would neutralize 'unsafe-inline' and brick prerendered
    // inline scripts — it must NOT be present until pages go force-dynamic
    expect(csp!).not.toContain('nonce-');
    expect(csp!).not.toContain('strict-dynamic');
    expect(csp!).toContain("default-src 'self'");
    expect(csp!).toContain("object-src 'none'");
    expect(csp!).toContain("frame-ancestors 'none'");
    expect(csp!).toContain("base-uri 'self'");
    expect(csp!).toContain("form-action 'self'");
    expect(csp!).toContain("frame-src 'self' https://accounts.google.com");
    expect(csp!).not.toContain("frame-src 'none'");
    expect(csp!).toContain("connect-src 'self'");
    expect(csp!).toContain('upgrade-insecure-requests');
    // user-submitted https images must keep working
    expect(csp!).toContain("img-src 'self' data: blob: https:");
    vi.unstubAllEnvs();
  });
});
