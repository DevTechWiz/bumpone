import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest } from '@/lib/rateLimit';

const messageSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(200, 'Message cannot exceed 200 characters'),
  slotTag: z.number().int().min(1).max(100).optional(),
});

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
];

export async function GET() {
  try {
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
      console.error('Error fetching war room messages:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
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
    console.error('Failed to load war room messages:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to send messages in the Live Showcase Feed.' },
        { status: 401 }
      );
    }

    // Rate limit: 5 messages per 30 seconds per user
    if (!allowRequest(`war_room_msg:${user.id}`, 5, 30_000)) {
      return NextResponse.json(
        { error: 'Message cooldown active. Please wait a few seconds before posting again.' },
        { status: 429, headers: { 'Retry-After': '10' } }
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = messageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid transmission format.' },
        { status: 400 }
      );
    }

    const { text, slotTag } = parsed.data;

    // Fetch author's handle and display name
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
        is_official: false, // Strictly enforced: users can NEVER spoof official flag
      })
      .select('id, user_id, author_name, author_handle, avatar_color, text, slot_tag, is_official, created_at')
      .single();

    if (insertError || !inserted) {
      console.error('Failed to insert war room message:', insertError);
      return NextResponse.json({ error: 'Failed to record transmission' }, { status: 500 });
    }

    const message = {
      id: inserted.id,
      sender: authorHandle,
      avatarColor: inserted.avatar_color,
      text: inserted.text,
      slotTag: inserted.slot_tag ?? undefined,
      timestamp: new Date(inserted.created_at).getTime(),
      isOfficial: false,
    };

    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    console.error('Error posting war room message:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
