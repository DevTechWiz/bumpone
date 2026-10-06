import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest } from '@/lib/rateLimit';
import { clientIp, PRIVATE_NO_STORE } from '@/lib/requestGuard';
import { safeExternalUrl } from '@/lib/urls';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Handles are strictly [a-z0-9_] (validated by check-handle + the users trigger),
// which also makes the PostgREST .or() filter injection-safe (SEC-020).
const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Per-IP budget: profile scraping is one service-role query per hit (SEC-007).
  if (!allowRequest(`profile_read:${clientIp(request)}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...PRIVATE_NO_STORE, 'Retry-After': '60' } });
  }

  const { id } = await params;

  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      const isUuid = UUID_RE.test(id);
      const plainHandle = id.startsWith('@') ? id.slice(1) : id;

      // SEC-020: malformed handles can never match a stored row and must not
      // reach the query builder (404, not 500).
      if (!isUuid && !HANDLE_RE.test(plainHandle)) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404, headers: PRIVATE_NO_STORE });
      }

      let query = supabaseAdmin
        .from('projects')
        .select(`
          id,
          user_id,
          moderation_status,
          is_active,
          ranking_sequence,
          title,
          handle,
          image_path,
          destination_url,
          current_rank,
          current_active_value_minor,
          total_paid_minor,
          reactions_fire,
          reactions_eyes,
          reactions_heart,
          reactions_laugh,
          total_reactions,
          categories(name),
          board_events(event_sequence, previous_rank, new_rank, created_at, profiles_displaced)
        `);

      if (isUuid) {
        query = query.eq('id', id);
      } else {
        query = query
          .or(`handle.eq.@${plainHandle},handle.eq.${plainHandle}`)
          .order('current_rank', { ascending: true });
      }

      const { data: projectList, error } = await query.limit(1);
      const project = projectList && projectList.length > 0 ? projectList[0] : null;

      if (error) {
        console.error('Profile query failed:', error.message);
      }

      if (!error && project) {
        // SEC-006: only approved+active projects are publicly readable.
        // The owner may always fetch their own project (drafts, suspended state).
        const isVisible =
          (project as any).moderation_status === 'approved' && (project as any).is_active === true;

        if (!isVisible) {
          const supabase = await createServerSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || user.id !== (project as any).user_id) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404, headers: PRIVATE_NO_STORE });
          }
        }

        const reactions = {
          fire: Number((project as any).reactions_fire || 0),
          eyes: Number((project as any).reactions_eyes || 0),
          heart: Number((project as any).reactions_heart || 0),
          laugh: Number((project as any).reactions_laugh || 0),
        };

        const categoryName = Array.isArray((project as any).categories)
          ? (project as any).categories[0]?.name
          : (project as any).categories?.name;

        const activeValue = Math.floor(Number((project as any).current_active_value_minor || 0) / 100);

        return NextResponse.json(
          {
            id: project.id,
            name: (project as any).title || (project as any).display_name || 'Project',
            handle: project.handle,
            category: categoryName || 'Tech',
            active_value: activeValue,
            total_paid: Math.round(Number(project.total_paid_minor || 0) / 100),
            imageUrl: project.image_path,
            linkUrl: safeExternalUrl(project.destination_url),
            rank: project.current_rank,
            reactions,
            board_events: (project as any).board_events || [],
          },
          // Owner-only drafts share this response shape: never cache in a
          // shared cache (cache-security, Phase 3).
          { headers: PRIVATE_NO_STORE }
        );
      }
    }

    return NextResponse.json({ error: 'Profile not found' }, { status: 404, headers: PRIVATE_NO_STORE });
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: PRIVATE_NO_STORE });
  }
}
