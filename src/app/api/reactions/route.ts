import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { invalidateBoardCache } from '@/lib/boardCache';
import { allowRequest } from '@/lib/rateLimit';
import { clientIp, PRIVATE_NO_STORE, newRequestId } from '@/lib/requestGuard';

const VALID_REACTIONS = ['fire', 'eyes', 'heart', 'laugh'] as const;
type ReactionType = (typeof VALID_REACTIONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Budgets: 60 write-actions per minute per user; 120 reads per minute per IP.
// Backed by the shared limiter (eviction + key cap — SEC-007).

export async function GET(request: NextRequest) {
  try {
    if (!allowRequest(`reactions_read:${clientIp(request)}`, 120, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...PRIVATE_NO_STORE, 'Retry-After': '60' } });
    }
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || searchParams.get('profileId');

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400, headers: PRIVATE_NO_STORE });
    }

    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400, headers: PRIVATE_NO_STORE });
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
      const projPromise = supabaseAdmin
        .from('projects')
        .select('reactions_fire, reactions_eyes, reactions_heart, reactions_laugh')
        .eq('id', projectId)
        .single();

      const userReactionsPromise = user
        ? supabaseAdmin
            .from('reactions')
            .select('reaction_type')
            .eq('project_id', projectId)
            .eq('user_id', user.id)
        : Promise.resolve({ data: null, error: null });

      const [{ data: proj }, { data: userRxData, error: rxErr }] = await Promise.all([
        projPromise,
        userReactionsPromise,
      ]);

      if (proj) {
        reactions = {
          fire: Number(proj.reactions_fire || 0),
          eyes: Number(proj.reactions_eyes || 0),
          heart: Number(proj.reactions_heart || 0),
          laugh: Number(proj.reactions_laugh || 0),
        };
      }

      if (!rxErr && userRxData) {
        userReactions = userRxData.map((r: any) => r.reaction_type);
      }
    }

    // userReactions is session-specific: never allow a shared cache to serve
    // one user's reaction state to another (cache-security, Phase 3).
    return NextResponse.json({ userReactions, reactions }, { headers: PRIVATE_NO_STORE });
  } catch (err: any) {
    const requestId = newRequestId();
    console.error('Error fetching user reactions:', requestId, err);
    return NextResponse.json(
      { userReactions: [], reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 }, request_id: requestId },
      { status: 500, headers: PRIVATE_NO_STORE }
    );
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

    if (!UUID_RE.test(targetId)) {
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
    }

    if (!allowRequest(`reaction_write:${user.id}`, 60, 60_000)) {
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
      // Session client (authenticated role): the DB binding in
      // add_project_reaction_auth verifies auth.uid() === p_user_id (SEC-004).
      const rpcRes = await supabase.rpc('add_project_reaction_auth', {
        p_project_id: targetId,
        p_user_id: user.id,
        p_reaction_type: reaction,
      });

      if (rpcRes.error || !rpcRes.data) {
        const requestId = newRequestId();
        console.error('add_project_reaction_auth RPC failed:', requestId, rpcRes.error?.message);
        return NextResponse.json({ error: 'Failed to record reaction', request_id: requestId }, { status: 500 });
      }

      // The RPC reports soft failures as data ({success:false, error:'Project
      // not found'}), never as a PostgREST error — translate them to real
      // HTTP statuses so phantom profile ids can not collect 200s.
      if (rpcRes.data.success === false) {
        const rpcError = String(rpcRes.data.error || 'Reaction rejected');
        return NextResponse.json(
          { error: rpcError },
          { status: rpcError === 'Project not found' ? 404 : 400 }
        );
      }

      count = rpcRes.data.count ?? count;
      alreadyReacted = Boolean(rpcRes.data.already_reacted);

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
    const requestId = newRequestId();
    console.error('Error recording reaction:', requestId, err);
    return NextResponse.json({ error: 'Failed to record reaction', request_id: requestId }, { status: 500 });
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

    if (!allowRequest(`reaction_write:${user.id}`, 60, 60_000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: max 60 reactions per minute' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('projectId') || searchParams.get('profileId');
    const reaction = searchParams.get('reaction') as ReactionType;

    if (!targetId || !reaction || !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Invalid projectId or reaction type' }, { status: 400 });
    }

    if (!UUID_RE.test(targetId)) {
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
    }

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    let count = 0;
    let reactions: { fire: number; eyes: number; heart: number; laugh: number } | undefined = undefined;

    if (isSupabaseConfigured) {
      // Session client (authenticated role): DB binding verifies auth.uid() === p_user_id (SEC-004).
      const rpcRes = await supabase.rpc('remove_project_reaction_auth', {
        p_project_id: targetId,
        p_user_id: user.id,
        p_reaction_type: reaction,
      });

      if (rpcRes.error || !rpcRes.data) {
        const requestId = newRequestId();
        console.error('remove_project_reaction_auth RPC failed:', requestId, rpcRes.error?.message);
        return NextResponse.json({ error: 'Failed to remove reaction', request_id: requestId }, { status: 500 });
      }

      // Same soft-failure contract as POST: {success:false} is data, not an error.
      if (rpcRes.data.success === false) {
        const rpcError = String(rpcRes.data.error || 'Reaction rejected');
        return NextResponse.json(
          { error: rpcError },
          { status: rpcError === 'Project not found' ? 404 : 400 }
        );
      }

      count = rpcRes.data.count ?? count;

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
    const requestId = newRequestId();
    console.error('Error removing reaction:', requestId, err);
    return NextResponse.json({ error: 'Failed to remove reaction', request_id: requestId }, { status: 500 });
  }
}

