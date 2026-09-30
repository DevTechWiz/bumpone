import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_REACTIONS = ['fire', 'eyes', 'heart', 'laugh'] as const;
type ReactionType = (typeof VALID_REACTIONS)[number];

const SECRET = process.env.ANON_COOKIE_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-anon-secret');

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
    if (!SECRET) return NextResponse.json({ error: 'Anonymous identity service is unavailable' }, { status: 503 });
    const body = await request.json();

    const isUserTarget = Boolean(body.userId || body.targetType === 'user');
    const targetId = body.userId || body.projectId || body.profileId;
    const reaction = body.reaction as ReactionType;

    if (!targetId || !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Invalid targetId or reaction type' }, { status: 400 });
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
    let alreadyReacted = false;

    if (isSupabaseConfigured) {
      if (isUserTarget) {
        // Atomic creator/user profile reaction
        const rpcRes = await supabaseAdmin.rpc('add_user_reaction', {
          p_user_id: targetId,
          p_anonymous_id: anonId,
          p_reaction_type: reaction,
        });

        if (!rpcRes.error && rpcRes.data) {
          count = rpcRes.data.count ?? count;
          alreadyReacted = Boolean(rpcRes.data.already_reacted);
        }
      } else {
        // Atomic project (reel/slot) reaction
        const rpcRes = await supabaseAdmin.rpc('add_project_reaction', {
          p_project_id: targetId,
          p_anonymous_id: anonId,
          p_reaction_type: reaction,
        });

        if (!rpcRes.error && rpcRes.data) {
          count = rpcRes.data.count ?? count;
          alreadyReacted = Boolean(rpcRes.data.already_reacted);
        }
      }
    }

    const res = NextResponse.json({ success: true, count, alreadyReacted });
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
    const userId = searchParams.get('userId');
    const projectId = searchParams.get('projectId') || searchParams.get('profileId');
    const targetType = searchParams.get('targetType');
    const isUserTarget = Boolean(userId || targetType === 'user');
    const targetId = userId || projectId;
    const reaction = searchParams.get('reaction') as ReactionType;

    if (!targetId || !reaction || !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Invalid targetId or reaction type' }, { status: 400 });
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

    let count = 0;

    if (isSupabaseConfigured) {
      if (isUserTarget) {
        const rpcRes = await supabaseAdmin.rpc('remove_user_reaction', {
          p_user_id: targetId,
          p_anonymous_id: anonId,
          p_reaction_type: reaction,
        });
        if (!rpcRes.error && rpcRes.data) {
          count = rpcRes.data.count ?? count;
        }
      } else {
        const rpcRes = await supabaseAdmin.rpc('remove_project_reaction', {
          p_project_id: targetId,
          p_anonymous_id: anonId,
          p_reaction_type: reaction,
        });
        if (!rpcRes.error && rpcRes.data) {
          count = rpcRes.data.count ?? count;
        }
      }
    }

    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error('Error removing reaction:', err);
    return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
  }
}
