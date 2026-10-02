import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../app/api/profile/check-handle/route';
import { supabaseAdmin } from '../lib/supabase/admin';
import { NextRequest } from 'next/server';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('Profile Handle Availability & Validation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects handles shorter than 2 characters', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile/check-handle?handle=a');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('at least 2 characters');
  });

  it('rejects handles longer than 30 characters', async () => {
    const longHandle = 'a'.repeat(31);
    const req = new NextRequest(`http://localhost:3000/api/profile/check-handle?handle=${longHandle}`);
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('cannot exceed 30 characters');
  });

  it('rejects handles with special characters', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile/check-handle?handle=bad@handle!');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.available).toBe(false);
    expect(data.error).toContain('letters, numbers, and underscores');
  });

  it('returns available: true when handle is not taken in db', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockIlike = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ ilike: mockIlike });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/profile/check-handle?handle=unique_creator');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.available).toBe(true);
    expect(data.handle).toBe('unique_creator');
  });

  it('returns available: false when handle is taken by another user', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'other-user-id' }, error: null });
    const mockNeq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockIlike = vi.fn().mockReturnValue({ neq: mockNeq });
    const mockSelect = vi.fn().mockReturnValue({ ilike: mockIlike });

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
    } as any);

    const req = new NextRequest('http://localhost:3000/api/profile/check-handle?handle=taken_handle&userId=my-user-id');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.available).toBe(false);
    expect(data.error).toContain('already taken');
  });
});

describe('30-Day Monthly Handle Cooldown Calculation', () => {
  it('returns 0 if handle was never changed (null/undefined)', async () => {
    const { getHandleCooldownRemainingDays } = await import('../lib/board');
    expect(getHandleCooldownRemainingDays(null)).toBe(0);
    expect(getHandleCooldownRemainingDays(undefined)).toBe(0);
    expect(getHandleCooldownRemainingDays('')).toBe(0);
  });

  it('returns remaining days when changed within the last 30 days', async () => {
    const { getHandleCooldownRemainingDays } = await import('../lib/board');
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const remaining = getHandleCooldownRemainingDays(tenDaysAgo);
    expect(remaining).toBe(20);

    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(getHandleCooldownRemainingDays(oneDayAgo)).toBe(29);
  });

  it('returns 0 when 30 or more days have passed', async () => {
    const { getHandleCooldownRemainingDays } = await import('../lib/board');
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(getHandleCooldownRemainingDays(thirtyOneDaysAgo)).toBe(0);
  });
});
