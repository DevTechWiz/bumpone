import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getBadge } from '../app/api/badge/[id]/route';
import { POST as postClick, GET as getClick } from '../app/api/track/click/route';
import { supabaseAdmin } from '../lib/supabase/admin';
import { NextRequest } from 'next/server';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('Dynamic Embed Badge & Click Tracking Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves dynamic SVG badge with correct headers', async () => {
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'test-proj', title: 'Acme SaaS', handle: 'acme', current_rank: 1, is_active: true },
          }),
        }),
      }),
    });

    const req = new NextRequest('http://localhost:3000/api/badge/@acme');
    const res = await getBadge(req, { params: Promise.resolve({ id: '@acme' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    const body = await res.text();
    expect(body).toContain('<svg');
    expect(body).toContain('👑 Rank #1');
    expect(body).toContain('BumpOne.lol');
  });

  it('rejects click tracking when projectId is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/track/click', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await postClick(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing projectId');
  });

  it('records outbound click safely', async () => {
    (supabaseAdmin.rpc as any).mockResolvedValue({ data: null, error: null });

    const req = new NextRequest('http://localhost:3000/api/track/click', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-123' }),
    });
    const res = await postClick(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
