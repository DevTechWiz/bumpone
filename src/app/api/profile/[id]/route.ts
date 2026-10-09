import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest } from '@/lib/rateLimit';
import { clientIp, PRIVATE_NO_STORE, newRequestId } from '@/lib/requestGuard';
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
          views_count,
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

      query = query.order('event_sequence', {
        ascending: true,
        referencedTable: 'board_events',
      });

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

        const currentRank =
          (project as any).current_rank != null ? Number((project as any).current_rank) : null;

        // Passport metrics (docs/01 Rule 25): derive the journey from the
        // project's own board_events so peak/times/timeline reflect server truth.
        const events = Array.isArray((project as any).board_events)
          ? [...(project as any).board_events].sort(
              (a: any, b: any) => Number(a?.event_sequence || 0) - Number(b?.event_sequence || 0)
            )
          : [];
        const journeyRanks = events
          .map((e: any) => Number(e?.new_rank))
          .filter((r: number) => Number.isFinite(r) && r > 0);
        if (events.length > 0 && events[0]?.previous_rank != null) {
          const firstPrev = Number(events[0].previous_rank);
          if (Number.isFinite(firstPrev) && firstPrev > 0) journeyRanks.unshift(firstPrev);
        }
        const timesBumped = events.length;
        const timesClimbed = events.filter((e: any) => {
          const prev = e?.previous_rank != null ? Number(e.previous_rank) : null;
          const next = Number(e?.new_rank);
          return prev !== null && Number.isFinite(next) && next < prev;
        }).length;
        const peakRank =
          journeyRanks.length > 0
            ? Math.min(...journeyRanks)
            : currentRank !== null
              ? currentRank
              : 0;
        const journey =
          journeyRanks.length > 0
            ? journeyRanks
            : currentRank !== null
              ? [currentRank]
              : [];

        // Unique passport visits: 1 view per IP per profile per hour (docs/16).
        let viewsCount = Number((project as any).views_count || 0);
        if (isVisible) {
          try {
            if (allowRequest(`profile_view:${(project as any).id}:${clientIp(request)}`, 1, 3_600_000)) {
              const { data: viewRow } = await supabaseAdmin
                .from('projects')
                .select('views_count')
                .eq('id', (project as any).id)
                .maybeSingle();
              const nextViews = Number((viewRow as any)?.views_count || 0) + 1;
              const { error: viewError } = await supabaseAdmin
                .from('projects')
                .update({ views_count: nextViews })
                .eq('id', (project as any).id);
              if (!viewError) viewsCount = nextViews;
            }
          } catch (viewErr) {
            console.warn('Profile view count skipped:', viewErr);
          }
        }

        // Unranked projects (#101+) still show their exact standing: rank is
        // 1 + profiles ahead by value, tie-broken by ranking_sequence.
        let exactRank = currentRank;
        if (exactRank === null && isVisible) {
          try {
            const myVal = Number((project as any).current_active_value_minor || 0);
            const mySeq = Number((project as any).ranking_sequence || 0);
            const [ahead, tied] = await Promise.all([
              supabaseAdmin
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('moderation_status', 'approved')
                .eq('is_active', true)
                .gt('current_active_value_minor', myVal),
              supabaseAdmin
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('moderation_status', 'approved')
                .eq('is_active', true)
                .eq('current_active_value_minor', myVal)
                .lt('ranking_sequence', mySeq),
            ]);
            if (!ahead.error && !tied.error) {
              exactRank = 1 + Number(ahead.count || 0) + Number(tied.count || 0);
            }
          } catch (rankErr) {
            console.warn('Exact rank computation skipped:', rankErr);
          }
        }

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
            rank: exactRank,
            views: viewsCount,
            peak_rank: peakRank,
            times_bumped: timesBumped,
            times_climbed: timesClimbed,
            journey,
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
    const requestId = newRequestId();
    console.error('Error fetching profile:', requestId, err);
    return NextResponse.json({ error: 'Internal server error', request_id: requestId }, { status: 500, headers: PRIVATE_NO_STORE });
  }
}
