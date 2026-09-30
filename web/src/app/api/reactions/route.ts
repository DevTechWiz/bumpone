import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_REACTIONS = ['fire', 'eyes', 'heart', 'laugh'] as const;

const SECRET = process.env.ANON_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'bumpone_anon_cookie_secret_salt_2026';

function signAnonId(id: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(id).digest('hex');
  return `${id}.${hmac}`;
}

function verifyAnonId(signedValue: string): string | null {
  const parts = signedValue.split('.');
  if (parts.length !== 2) return null;
  const [id, signature] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(id).digest('hex');
  try {
    if (crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) {
      return id;
    }
  } catch {
    return null;
  }
  return null;
}

// In-memory sliding window rate limiter: max 30 reactions per minute per anon identity
const reactionRateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(id: string): boolean {
  const now = Date.now();
  const entry = reactionRateMap.get(id);

  if (!entry || now > entry.resetAt) {
    reactionRateMap.set(id, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= 30) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetId = body.projectId || body.profileId;
    const reaction = body.reaction;

    if (!targetId || !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Invalid projectId or reaction type' }, { status: 400 });
    }

    const rawCookie = request.cookies.get('bumped_anon_id')?.value;
    let anonId = rawCookie ? verifyAnonId(rawCookie) : null;
    let isNewCookie = false;

    if (!anonId) {
      anonId = crypto.randomUUID();
      isNewCookie = true;
    }

    // Rate limiting check
    if (!checkRateLimit(anonId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: max 30 reactions per minute' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    let count = 1;

    if (isSupabaseConfigured) {
      // Atomic RPC execution: records reaction and increments count in 1 single ACID step
      const rpcTry1 = await supabaseAdmin.rpc('add_project_reaction', {
        p_project_id: targetId,
        p_anonymous_id: anonId,
        p_reaction_type: reaction,
      });

      if (!rpcTry1.error && rpcTry1.data && rpcTry1.data.count !== undefined) {
        count = rpcTry1.data.count;
      } else {
        // Fallback to legacy function name
        const rpcTry2 = await supabaseAdmin.rpc('add_profile_reaction', {
          p_profile_id: targetId,
          p_anonymous_id: anonId,
          p_reaction_type: reaction,
        });
        if (!rpcTry2.error && rpcTry2.data && rpcTry2.data.count !== undefined) {
          count = rpcTry2.data.count;
        }
      }
    }

    const res = NextResponse.json({ success: true, count });
    if (isNewCookie) {
      res.cookies.set('bumped_anon_id', signAnonId(anonId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 365 * 24 * 3600, // 1 year
      });
    }

    return res;
  } catch (err: any) {
    console.error('Error handling reaction:', err);
    return NextResponse.json({ error: 'Failed to record reaction' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('projectId') || searchParams.get('profileId');
    const reaction = searchParams.get('reaction');

    if (!targetId || !reaction || !VALID_REACTIONS.includes(reaction as any)) {
      return NextResponse.json({ error: 'Invalid projectId or reaction type' }, { status: 400 });
    }

    const rawCookie = request.cookies.get('bumped_anon_id')?.value;
    const anonId = rawCookie ? verifyAnonId(rawCookie) : null;

    if (!anonId) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      // Try projects schema (project_id)
      const { error: delErr } = await supabaseAdmin
        .from('reactions')
        .delete()
        .eq('project_id', targetId)
        .eq('anonymous_id', anonId)
        .eq('reaction_type', reaction);

      if (delErr) {
        // Fallback to legacy profile_id
        await supabaseAdmin
          .from('reactions')
          .delete()
          .eq('profile_id', targetId)
          .eq('anonymous_id', anonId)
          .eq('reaction_type', reaction);
      }

      // Decrement count
      const countRes1 = await supabaseAdmin
        .from('reaction_counts')
        .select('count')
        .eq('project_id', targetId)
        .eq('reaction_type', reaction)
        .single();

      if (countRes1.data && countRes1.data.count > 0) {
        await supabaseAdmin
          .from('reaction_counts')
          .update({ count: Math.max(0, countRes1.data.count - 1) })
          .eq('project_id', targetId)
          .eq('reaction_type', reaction);
      } else {
        const countRes2 = await supabaseAdmin
          .from('reaction_counts')
          .select('count')
          .eq('profile_id', targetId)
          .eq('reaction_type', reaction)
          .single();

        if (countRes2.data && countRes2.data.count > 0) {
          await supabaseAdmin
            .from('reaction_counts')
            .update({ count: Math.max(0, countRes2.data.count - 1) })
            .eq('profile_id', targetId)
            .eq('reaction_type', reaction);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error removing reaction:', err);
    return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
  }
}
