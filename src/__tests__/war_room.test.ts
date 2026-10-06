import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// SEC-012 — schema tests run against the real messageSchema, rate limiting
// against the real local limiter, and identity/officialness/telemetry are
// asserted through the actual route handlers (never re-implemented logic).
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { supabaseAdmin } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { allowRequest, resetRateLimits } from '../lib/rateLimit';
import { messageSchema } from '../lib/contentSchemas';
import { POST as postMessage } from '../app/api/war-room/messages/route';
import { GET as getEvents } from '../app/api/war-room/events/route';
import { makeBuilder } from './security/helpers';

type SessionUser = { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null;

function mockSession(user: SessionUser) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue(
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } }
      ),
    },
  };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as any);
  return client;
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockMessageTables(resultIsOfficial: boolean) {
  const users = makeBuilder({ data: { handle: 'real_trader', display_name: 'Real Trader' }, error: null });
  const messages = makeBuilder({
    data: {
      id: 'msg-1',
      user_id: 'usr_session_1',
      author_name: 'Real Trader',
      author_handle: '@real_trader',
      avatar_color: 'bg-indigo-500',
      text: 'hello',
      slot_tag: null,
      is_official: resultIsOfficial,
      created_at: '2026-10-06T00:00:00.000Z',
    },
    error: null,
  });
  vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
    if (table === 'users') return users;
    if (table === 'messages') return messages;
    throw new Error(`unexpected table queried: ${table}`);
  }) as any);
  return { users, messages };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Message Validation (real messageSchema)', () => {
  it('enforces maximum character length of 200 chars and trims whitespace', () => {
    const longText = 'A'.repeat(250);
    const parsedOver = messageSchema.safeParse({ text: longText });
    expect(parsedOver.success).toBe(false);

    const valid200 = 'A'.repeat(200);
    const parsedValid = messageSchema.safeParse({ text: valid200 });
    expect(parsedValid.success).toBe(true);
    if (parsedValid.success) {
      expect(parsedValid.data.text.length).toBe(200);
    }
  });

  it('rejects empty or whitespace-only messages', () => {
    expect(messageSchema.safeParse({ text: '' }).success).toBe(false);
    expect(messageSchema.safeParse({ text: '   \n\t  ' }).success).toBe(false);
  });

  it('strips client-supplied sender identity and metadata at parse time', () => {
    const maliciousPayload = {
      text: 'Hello world',
      sender: '@elonmusk',
      author_name: 'Vitalik',
      author_handle: '@vitalik',
      user_id: '00000000-0000-0000-0000-000000000000',
      avatarColor: 'bg-gold-500',
      isOfficial: true,
      is_official: true,
    };

    const parsed = messageSchema.safeParse(maliciousPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const keys = Object.keys(parsed.data);
      expect(keys).toContain('text');
      expect(keys).not.toContain('sender');
      expect(keys).not.toContain('author_name');
      expect(keys).not.toContain('author_handle');
      expect(keys).not.toContain('user_id');
      expect(keys).not.toContain('avatarColor');
      expect(keys).not.toContain('isOfficial');
      expect(keys).not.toContain('is_official');
    }
  });

  it('sanitizes and limits slot tags to valid range #1 to #100', () => {
    expect(messageSchema.safeParse({ text: 'test', slotTag: 42 }).success).toBe(true);
    expect(messageSchema.safeParse({ text: 'test', slotTag: 0 }).success).toBe(false);
    expect(messageSchema.safeParse({ text: 'test', slotTag: 101 }).success).toBe(false);
    expect(messageSchema.safeParse({ text: 'test', slotTag: -5 }).success).toBe(false);
  });
});

describe('POST /api/war-room/messages — authoritative identity (SEC-012)', () => {
  it('forces is_official false and DB-derived identity for a spoofing non-admin', async () => {
    mockSession({ id: 'usr_nonadmin_1', app_metadata: {}, user_metadata: {} });
    const { messages } = mockMessageTables(false);

    const res = await postMessage(jsonRequest('http://localhost/api/war-room/messages', {
      text: 'hello',
      // Attacker spoofs official status, author, handle, and user id.
      isOfficial: true,
      is_official: true,
      author_name: 'Vitalik',
      author_handle: '@vitalik',
      user_id: '00000000-0000-0000-0000-000000000000',
      sender: '@elonmusk',
    }));

    expect(res.status).toBe(200);
    expect(messages.insert).toHaveBeenCalledWith({
      user_id: 'usr_nonadmin_1',
      author_name: 'Real Trader',
      author_handle: '@real_trader',
      avatar_color: expect.any(String),
      text: 'hello',
      slot_tag: null,
      is_official: false,
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message.isOfficial).toBe(false);
    expect(body.message.sender).toBe('@real_trader');
  });

  it('stores is_official true only when the session carries an admin role', async () => {
    mockSession({ id: 'usr_admin_1', app_metadata: { role: 'super_admin' }, user_metadata: {} });
    const { messages } = mockMessageTables(true);

    const res = await postMessage(jsonRequest('http://localhost/api/war-room/messages', {
      text: 'real official announcement',
      isOfficial: true,
    }));

    expect(res.status).toBe(200);
    expect(messages.insert).toHaveBeenCalledWith(
      expect.objectContaining({ is_official: true, user_id: 'usr_admin_1' })
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message.isOfficial).toBe(true);
  });

  it('scopes the identity lookup to the session user, never the body-supplied id', async () => {
    mockSession({ id: 'usr_session_2', app_metadata: {}, user_metadata: {} });
    const { users } = mockMessageTables(false);

    const res = await postMessage(jsonRequest('http://localhost/api/war-room/messages', {
      text: 'hello',
      user_id: '00000000-0000-0000-0000-000000000000',
      author_handle: '@vitalik',
    }));

    expect(res.status).toBe(200);
    expect(users.eq).toHaveBeenCalledWith('id', 'usr_session_2');
    expect(users.eq).not.toHaveBeenCalledWith('id', '00000000-0000-0000-0000-000000000000');
  });

  it('401s unauthenticated posters before any database contact', async () => {
    mockSession(null);

    const res = await postMessage(jsonRequest('http://localhost/api/war-room/messages', {
      text: 'hello',
    }));

    expect(res.status).toBe(401);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});

describe('Rate Limiting & Cooldown Protection (real limiter)', () => {
  it('allows up to 5 messages per 30-second window per user', () => {
    const userId = 'user_test_anti_spam';
    const windowMs = 30_000;
    const limit = 5;

    for (let i = 0; i < limit; i++) {
      expect(allowRequest(`war_room_msg:${userId}`, limit, windowMs)).toBe(true);
    }

    // 6th message in same window must be blocked
    expect(allowRequest(`war_room_msg:${userId}`, limit, windowMs)).toBe(false);
  });
});

describe('GET /api/war-room/events — battle telemetry mapping', () => {
  it('maps board_events rows into real BumpEvent telemetry', async () => {
    const createdAt = '2026-10-06T00:00:00.000Z';
    const boardEvents = makeBuilder({
      data: [{
        id: 'event-123',
        event_sequence: 1,
        project_id: 'proj-1',
        project_title_snapshot: 'HyperAI',
        project_handle_snapshot: 'hyper',
        previous_rank: 5,
        new_rank: 1,
        previous_active_value_minor: 4000,
        new_active_value_minor: 15000,
        profiles_displaced: 4,
        event_type: 'purchase',
        created_at: createdAt,
        projects: {
          title: 'HyperAI',
          handle: 'hyper',
          image_path: 'https://img.test/x.png',
          destination_url: 'https://x.test',
          current_active_value_minor: 15000,
        },
      }],
      error: null,
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(boardEvents);

    const res = await getEvents(new NextRequest('http://localhost/api/war-room/events'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.events).toHaveLength(1);
    const event = body.events[0];
    expect(event.newRank).toBe(1);
    expect(event.previousRank).toBe(5);
    expect(event.promotedItem.rank).toBe(1);
    expect(event.promotedItem.activeValue).toBe(150);
    expect(event.promotedItem.bidderName).toBe('@hyper');
    expect(event.droppedItem.rank).toBe(6);
    expect(event.droppedItem.activeValue).toBe(40);
    expect(event.droppedItem.title).toBe('Displaced Contender');
  });
});
