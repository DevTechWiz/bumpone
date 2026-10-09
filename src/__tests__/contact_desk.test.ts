import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('../lib/resend', () => ({
  getResendClient: vi.fn(() => null),
  sendContactNotification: vi.fn(() => Promise.resolve()),
  sendContactReply: vi.fn(() => Promise.resolve({ success: true, id: 'msg_123' })),
}));

import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { resetRateLimits } from '../lib/rateLimit';
import { POST as postContact } from '../app/api/contact/route';
import { GET as getAdminContact, PATCH as patchAdminContact } from '../app/api/admin/contact/route';
import { POST as postAdminReply } from '../app/api/admin/contact/reply/route';

function jsonRequest(url: string, method: string, body: any) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBuilder(result: { data: any; error: any }) {
  const builder: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'single']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

describe('Contact Desk & Support API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  describe('POST /api/contact (Public Submission)', () => {
    it('rejects submissions with missing fields', async () => {
      const req = jsonRequest('http://localhost/api/contact', 'POST', { name: '' });
      const res = await postContact(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('rejects invalid email addresses', async () => {
      const req = jsonRequest('http://localhost/api/contact', 'POST', {
        name: 'Alex',
        email: 'invalid-email',
        subject: 'Help',
        message: 'Hello, this is a test inquiry.',
      });
      const res = await postContact(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/valid email/i);
    });

    it('silently succeeds on bot honeypot submission without database call', async () => {
      const req = jsonRequest('http://localhost/api/contact', 'POST', {
        name: 'Bot',
        email: 'bot@example.com',
        subject: 'Spam',
        message: 'Buy our fake products now!',
        _hp: 'im-a-bot',
      });
      const res = await postContact(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('successfully stores valid contact message in database', async () => {
      vi.mocked(supabaseAdmin.from).mockReturnValue(
        makeBuilder({ data: { id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', created_at: new Date().toISOString() }, error: null }) as any
      );

      const req = jsonRequest('http://localhost/api/contact', 'POST', {
        name: 'Devin',
        email: 'devin@example.com',
        subject: 'Listing assistance',
        message: 'I have a question about billboard rankings.',
      });

      const res = await postContact(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.id).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
      expect(supabaseAdmin.from).toHaveBeenCalledWith('contact_messages');
    });
  });

  describe('Admin Contact Operations', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }) },
      } as any);

      const getReq = new NextRequest('http://localhost/api/admin/contact');
      const getRes = await getAdminContact(getReq);
      expect(getRes.status).toBe(401);

      const replyReq = jsonRequest('http://localhost/api/admin/contact/reply', 'POST', {
        messageId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        replyText: 'Hi there',
      });
      const replyRes = await postAdminReply(replyReq);
      expect(replyRes.status).toBe(401);
    });

    it('dispatches reply and updates ticket thread for admin', async () => {
      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'admin_1', email: 'support@bumpone.lol', app_metadata: { role: 'admin' } },
            },
            error: null,
          }),
        },
      } as any);

      const mockTicket = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        name: 'Alice',
        email: 'alice@example.com',
        subject: 'Need help',
        message: 'How do I top up?',
        status: 'new',
        replies: [],
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(
        makeBuilder({ data: mockTicket, error: null }) as any
      );

      const replyReq = jsonRequest('http://localhost/api/admin/contact/reply', 'POST', {
        messageId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        replyText: 'You can top up by clicking on your spot on the grid.',
      });

      const res = await postAdminReply(replyReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.emailDispatched).toBe(true);
    });

    it('updates ticket status and admin notes via PATCH', async () => {
      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin_1', email: 'owner@bumpone.lol', app_metadata: { role: 'admin' } } },
            error: null,
          }),
        },
      } as any);

      vi.mocked(supabaseAdmin.from).mockReturnValue(
        makeBuilder({ data: { id: 'ticket_1', status: 'resolved' }, error: null }) as any
      );

      const patchReq = jsonRequest('http://localhost/api/admin/contact', 'PATCH', {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        status: 'resolved',
        admin_notes: 'Issue resolved over email.',
      });

      const res = await patchAdminContact(patchReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});

