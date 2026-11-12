import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/admin/config/route';
import { supabaseAdmin } from '../lib/supabase/admin';
import { requireAdmin } from '../lib/adminAuth';
import { NextRequest } from 'next/server';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('../lib/rateLimit', () => ({
  allowRequest: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/boardCache', () => ({
  invalidateBoardCache: vi.fn(),
}));

describe('POST /api/admin/config (Server Security Gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ error: 'Unauthenticated' } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        freeClaimsEnabled: false,
        reason: 'Security check',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin authenticated users with 403', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ error: 'Forbidden' } as any);

    const req = new NextRequest('http://localhost:3000/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        freeClaimsEnabled: false,
        reason: 'Hacker trying to disable free claims',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('allows verified admin to update free claims toggle and limit', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: 'admin_usr_123', email: 'devendra.tampula@gmail.com' },
      role: 'super_admin',
    } as any);

    let upsertPayload: any = null;
    let auditPayload: any = null;

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'system_state') {
        return {
          upsert: vi.fn().mockImplementation((payload) => {
            upsertPayload = payload;
            return Promise.resolve({ error: null });
          }),
        } as any;
      }
      if (table === 'admin_audit_log') {
        return {
          insert: vi.fn().mockImplementation((payload) => {
            auditPayload = payload;
            return Promise.resolve({ error: null });
          }),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        freeClaimsEnabled: false,
        freeClaimsLimit: 30,
        reason: 'Admin turned off free promo early',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(upsertPayload).toMatchObject({
      id: 'global',
      free_claims_enabled: false,
      free_claims_limit: 30,
      updated_by: 'admin_usr_123',
    });

    expect(auditPayload).toMatchObject({
      admin_user_id: 'admin_usr_123',
      action: 'board_config_updated',
      target_type: 'system',
      target_id: 'global',
      reason: 'Admin turned off free promo early',
    });
  });
});
