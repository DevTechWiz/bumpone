import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/purchase/claim-free/route';
import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { getDynamicBoardConfig } from '../lib/boardConfig';
import { NextRequest } from 'next/server';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('../lib/rateLimit', () => ({
  allowRequest: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/boardConfig', () => ({
  getDynamicBoardConfig: vi.fn().mockResolvedValue({
    freeClaimsEnabled: true,
    freeClaimsLimit: 50,
    minBumpUsd: 10,
    purchasesPaused: false,
  }),
}));

describe('POST /api/purchase/claim-free', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const req = new NextRequest('http://localhost:3000/api/purchase/claim-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Free App',
        handle: 'freeapp',
        linkUrl: 'https://freeapp.com',
        imageUrl: 'https://example.com/logo.png',
        category: 'AI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('sign in');
  });

  it('rejects invalid parameters (missing title or non-https URL)', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr_test_123', user_metadata: { name: 'Test User' } } },
        }),
      },
    } as any);

    const req = new NextRequest('http://localhost:3000/api/purchase/claim-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '',
        handle: 'freeapp',
        linkUrl: 'not-a-valid-url',
        imageUrl: 'https://example.com/logo.png',
        category: 'AI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid project parameters');
  });

  it('enforces 1 free claimed slot per user account (403)', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr_test_123', user_metadata: { name: 'Test User' } } },
        }),
      },
    } as any);

    // Mock existing user project
    const mockLimit = vi.fn().mockResolvedValue({
      data: [{ id: 'proj_existing_1', moderation_status: 'approved' }],
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/purchase/claim-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Second Free App',
        handle: 'secondapp',
        linkUrl: 'https://secondapp.com',
        imageUrl: 'https://example.com/logo.png',
        category: 'AI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('already claimed a slot');
  });

  it('rejects when board is fully occupied (100 active slots) (409)', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr_test_123', user_metadata: { name: 'Test User' } } },
        }),
      },
    } as any);

    // First call: check user projects (returns 0)
    // Second call: check board capacity (returns 100)
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'projects') {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 100, error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/purchase/claim-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Free App 101',
        handle: 'freeapp101',
        linkUrl: 'https://freeapp101.com',
        imageUrl: 'https://example.com/logo.png',
        category: 'AI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('capacity reached');
  });

  it('rejects when free claims are disabled by admin toggle in system_state (403)', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr_test_123', user_metadata: { name: 'Test User' } } },
        }),
      },
    } as any);

    vi.mocked(getDynamicBoardConfig).mockResolvedValueOnce({
      freeClaimsEnabled: false,
      freeClaimsLimit: 50,
      minBumpUsd: 10,
      purchasesPaused: false,
    });

    const req = new NextRequest('http://localhost:3000/api/purchase/claim-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Late App',
        handle: 'lateapp',
        linkUrl: 'https://lateapp.com',
        imageUrl: 'https://example.com/logo.png',
        category: 'AI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('currently disabled');
  });

  it('successfully creates free project with $0 value pending moderation', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr_test_123', user_metadata: { name: 'Test User' } } },
        }),
      },
    } as any);

    let insertPayload: any = null;

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockImplementation((fields, opts) => {
            if (opts?.count === 'exact') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }),
          insert: vi.fn().mockImplementation((payload) => {
            insertPayload = payload;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'proj_new_free_777' },
                  error: null,
                }),
              }),
            };
          }),
        } as any;
      }

      if (table === 'categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cat_ai_1' }, error: null }),
            }),
          }),
        } as any;
      }

      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'usr_test_123' }, error: null }),
            }),
          }),
        } as any;
      }

      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/purchase/claim-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Awesome Launch Project',
        handle: 'awesomeproject',
        linkUrl: 'https://awesome.dev',
        imageUrl: 'https://example.com/logo.png',
        category: 'AI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.project_id).toBe('proj_new_free_777');
    expect(insertPayload).toMatchObject({
      user_id: 'usr_test_123',
      title: 'Awesome Launch Project',
      current_active_value_minor: 0,
      total_paid_minor: 0,
      is_active: false,
      moderation_status: 'pending',
    });
  });
});
