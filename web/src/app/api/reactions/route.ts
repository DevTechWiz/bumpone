import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { invalidateBoardCache } from '@/lib/boardCache';

const VALID_REACTIONS = ['fire', 'eyes', 'heart', 'laugh'] as const;
type ReactionType = (typeof VALID_REACTIONS)[number];

// Lightweight sliding-window rate limiter: max 60 reactions per minute per authenticated user
const userRateMap = new Map<string, { count: number; resetAt: number }>();

function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = userRateMap.get(userId);

  // Periodic cleanup if map grows large
  if (userRateMap.size > 2000) {
    for (const [key, val] of userRateMap.entries()) {
      if (now > val.resetAt) {
        userRateMap.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetAt) {
    userRateMap.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= 60) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || searchParams.get('profileId');

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    let reactions = { fire: 0, eyes: 0, heart: 0, laugh: 0 };
    let userReactions: string[] = [];

    if (isSupabaseConfigured) {
      // 1. Fetch live reaction counts directly from projects table
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('reactions_fire, reactions_eyes, reactions_heart, reactions_laugh')
        .eq('id', projectId)
        .single();

      if (proj) {
        reactions = {
          fire: Number(proj.reactions_fire || 0),
          eyes: Number(proj.reactions_eyes || 0),
          heart: Number(proj.reactions_heart || 0),
          laugh: Number(proj.reactions_laugh || 0),
        };
      }

      // 2. Fetch authenticated user's active reactions
      if (user) {
        const { data, error } = await supabaseAdmin
          .from('reactions')
          .select('reaction_type')
          .eq('project_id', projectId)
          .eq('user_id', user.id);

        if (!error && data) {
          userReactions = data.map((r: any) => r.reaction_type);
        }
      }
    }

    return NextResponse.json({ userReactions, reactions });
  } catch (err: any) {
    console.error('Error fetching user reactions:', err);
    return NextResponse.json({ userReactions: [], reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to react.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetId = body.projectId || body.profileId;
    const reaction = body.reaction as ReactionType;

    if (!targetId || !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Invalid projectId or reaction type' }, { status: 400 });
    }

    if (!checkUserRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: max 60 reactions per minute' },
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
    let reactions: { fire: number; eyes: number; heart: number; laugh: number } | undefined = undefined;

    if (isSupabaseConfigured) {
      const rpcRes = await supabaseAdmin.rpc('add_project_reaction_auth', {
        p_project_id: targetId,
        p_user_id: user.id,
        p_reaction_type: reaction,
      });

      if (!rpcRes.error && rpcRes.data) {
        count = rpcRes.data.count ?? count;
        alreadyReacted = Boolean(rpcRes.data.already_reacted);
      } else if (rpcRes.error) {
        // Fallback to legacy RPC if auth migration has not been applied yet
        const legacyRpc = await supabaseAdmin.rpc('add_project_reaction', {
          p_project_id: targetId,
          p_anonymous_id: user.id,
          p_reaction_type: reaction,
        });
        if (!legacyRpc.error && legacyRpc.data) {
          count = legacyRpc.data.count ?? count;
          alreadyReacted = Boolean(legacyRpc.data.already_reacted);
        }
      }

      // Invalidate board in-memory cache so subsequent board queries return fresh counts
      invalidateBoardCache();

      // Query latest full reactions object
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('reactions_fire, reactions_eyes, reactions_heart, reactions_laugh')
        .eq('id', targetId)
        .single();

      if (proj) {
        reactions = {
          fire: Number(proj.reactions_fire || 0),
          eyes: Number(proj.reactions_eyes || 0),
          heart: Number(proj.reactions_heart || 0),
          laugh: Number(proj.reactions_laugh || 0),
        };
      }
    }

    return NextResponse.json({ success: true, count, alreadyReacted, reactions });
  } catch (err: any) {
    console.error('Error recording reaction:', err);
    return NextResponse.json({ error: 'Failed to record reaction' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('projectId') || searchParams.get('profileId');
    const reaction = searchParams.get('reaction') as ReactionType;

    if (!targetId || !reaction || !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Invalid projectId or reaction type' }, { status: 400 });
    }

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    let count = 0;
    let reactions: { fire: number; eyes: number; heart: number; laugh: number } | undefined = undefined;

    if (isSupabaseConfigured) {
      const rpcRes = await supabaseAdmin.rpc('remove_project_reaction_auth', {
        p_project_id: targetId,
        p_user_id: user.id,
        p_reaction_type: reaction,
      });

      if (!rpcRes.error && rpcRes.data) {
        count = rpcRes.data.count ?? count;
      } else if (rpcRes.error) {
        const legacyRpc = await supabaseAdmin.rpc('remove_project_reaction', {
          p_project_id: targetId,
          p_anonymous_id: user.id,
          p_reaction_type: reaction,
        });
        if (!legacyRpc.error && legacyRpc.data) {
          count = legacyRpc.data.count ?? count;
        }
      }

      // Invalidate board in-memory cache so subsequent board queries return fresh counts
      invalidateBoardCache();

      // Query latest full reactions object
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('reactions_fire, reactions_eyes, reactions_heart, reactions_laugh')
        .eq('id', targetId)
        .single();

      if (proj) {
        reactions = {
          fire: Number(proj.reactions_fire || 0),
          eyes: Number(proj.reactions_eyes || 0),
          heart: Number(proj.reactions_heart || 0),
          laugh: Number(proj.reactions_laugh || 0),
        };
      }
    }

    return NextResponse.json({ success: true, count, reactions });
  } catch (err: any) {
    console.error('Error removing reaction:', err);
    return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
  }
}

