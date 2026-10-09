import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest, allowRequestDistributed } from '@/lib/rateLimit';
import { clientIp, readJsonWithLimit, newRequestId } from '@/lib/requestGuard';
import { messageSchema } from '@/lib/contentSchemas';
import { securityLog } from '@/lib/securityLogger';

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
];

export async function GET(request: NextRequest) {
  try {
    if (!allowRequest(`war_room_read:${clientIp(request)}`, 120, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
    }

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (!isSupabaseConfigured) {
      return NextResponse.json({ messages: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id, user_id, author_name, author_handle, avatar_color, text, slot_tag, is_official, created_at')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      const requestId = newRequestId();
      console.error('Error fetching war room messages:', requestId, error);
      return NextResponse.json({ error: 'Failed to fetch messages', request_id: requestId }, { status: 500 });
    }

    const messages = (data || []).reverse().map((row) => ({
      id: row.id,
      sender: row.author_handle
        ? (row.author_handle.startsWith('@') ? row.author_handle : `@${row.author_handle}`)
        : (row.author_name || '@spectator'),
      avatarColor: row.avatar_color || 'bg-indigo-500',
      text: row.text,
      slotTag: row.slot_tag ?? undefined,
      timestamp: new Date(row.created_at).getTime(),
      isOfficial: Boolean(row.is_official),
    }));

    return NextResponse.json({ messages });
  } catch (err: any) {
    const requestId = newRequestId();
    console.error('Failed to load war room messages:', requestId, err);
    return NextResponse.json({ error: 'Internal server error', request_id: requestId }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      securityLog.authzFailure('war_room_post_unauthenticated', undefined, ip);
      return NextResponse.json(
        { error: 'Sign in to send shoutouts in the War Room.' },
        { status: 401 }
      );
    }

    // Rate limit: 5 messages per 30 seconds per user (distributed + local fallback)
    const allowed = await allowRequestDistributed(`war_room_msg:${user.id}`, 5, 30_000);
    if (!allowed) {
      securityLog.rateLimit('war_room_post_cooldown', `war_room_msg:${user.id}`, ip, 5, 30_000);
      return NextResponse.json(
        { error: 'Message cooldown active. Please wait a few seconds before posting again.' },
        { status: 429, headers: { 'Retry-After': '10' } }
      );
    }

    // Bounded body read before validation (SEC-008); malformed JSON → 400.
    const body = await readJsonWithLimit(request, 4 * 1024);
    if (!body.ok) return body.response;
    const parsed = messageSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid transmission format.' },
        { status: 400 }
      );
    }

    const { text, slotTag } = parsed.data;

    // Detect attempts to spoof official status
    const untrustedBody = body.value as Record<string, unknown>;
    let isOfficial = false;
    if (untrustedBody?.isOfficial === true || untrustedBody?.is_official === true) {
      const isAdmin = user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'super_admin';
      if (!isAdmin) {
        securityLog.suspiciousRealtime('war_room_official_spoof_attempt', ip, user.id, 'Non-admin attempted to set isOfficial: true');
        isOfficial = false;
      } else {
        isOfficial = true;
      }
    }

    // Authoritative author identity: strictly from users table or auth token, NEVER client payload
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('handle, display_name')
      .eq('id', user.id)
      .maybeSingle();

    const handle = userData?.handle || user.user_metadata?.user_name || `user_${user.id.slice(0, 6)}`;
    const displayName = userData?.display_name || user.user_metadata?.full_name || handle;
    const authorHandle = handle.startsWith('@') ? handle : `@${handle}`;

    // Pick consistent color based on user id hash
    const hash = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const avatarColor = AVATAR_COLORS[hash % AVATAR_COLORS.length];

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        user_id: user.id,
        author_name: displayName,
        author_handle: authorHandle,
        avatar_color: avatarColor,
        text,
        slot_tag: slotTag ?? null,
        is_official: isOfficial,
      })
      .select('id, user_id, author_name, author_handle, avatar_color, text, slot_tag, is_official, created_at')
      .single();

    if (insertError || !inserted) {
      const requestId = newRequestId();
      console.error('Failed to insert war room message:', requestId, insertError);
      return NextResponse.json({ error: 'Failed to record transmission', request_id: requestId }, { status: 500 });
    }

    const message = {
      id: inserted.id,
      sender: authorHandle,
      avatarColor: inserted.avatar_color,
      text: inserted.text,
      slotTag: inserted.slot_tag ?? undefined,
      timestamp: new Date(inserted.created_at).getTime(),
      isOfficial: inserted.is_official,
    };

    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    const requestId = newRequestId();
    console.error('Error posting war room message:', requestId, err);
    return NextResponse.json({ error: 'Internal server error', request_id: requestId }, { status: 500 });
  }
}
