import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildProfiles, sortBoard, type Profile, type Category } from '@/lib/board';

import { boardMemoryCache, CACHE_TTL_MS } from '@/lib/boardCache';

// In-memory fallback cache when Supabase database is not yet provisioned
let fallbackProfiles: Profile[] | null = null;

function getFallbackProfiles(): Profile[] {
  if (!fallbackProfiles) {
    fallbackProfiles = buildProfiles();
  }
  return fallbackProfiles;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get('sort') || 'power';
  const category = searchParams.get('category');
  const limit = Math.min(120, Math.max(1, Number(searchParams.get('limit')) || 100));

  const cacheKey = `${sort}:${category || 'All'}:${limit}`;
  const now = Date.now();
  const cached = boardMemoryCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return new NextResponse(cached.rawJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      // Query projects table (clean 2026 schema)
      const selectFieldsProject = category && category !== 'All'
        ? `
          id,
          user_id,
          ranking_sequence,
          title,
          handle,
          image_path,
          destination_url,
          current_rank,
          current_active_value_minor,
          total_paid_minor,
          is_active,
          moderation_status,
          categories!inner(name),
          reaction_counts(reaction_type, count)
        `
        : `
          id,
          user_id,
          ranking_sequence,
          title,
          handle,
          image_path,
          destination_url,
          current_rank,
          current_active_value_minor,
          total_paid_minor,
          is_active,
          moderation_status,
          categories(name),
          reaction_counts(reaction_type, count)
        `;

      let query = supabaseAdmin
        .from('projects')
        .select(selectFieldsProject)
        .eq('is_active', true)
        .eq('moderation_status', 'approved');

      if (category && category !== 'All') {
        query = query.eq('categories.name', category);
      }

      if (sort === 'trending') {
        query = query.order('updated_at', { ascending: false }).order('current_active_value_minor', { ascending: false });
      } else {
        query = query.order('current_active_value_minor', { ascending: false }).order('ranking_sequence', { ascending: true });
      }

      const { data: projectData, error: projectErr } = await query.limit(limit);
      let data: any[] | null = projectData as any;
      let error = projectErr;

      // Fallback to legacy schema if projects table is not yet migrated
      if (error || !data || data.length === 0) {
        let legacyQuery = supabaseAdmin
          .from('projects')
          .select('*')
          .eq('is_active', true)
          .eq('moderation_status', 'approved');

        if (sort === 'trending') {
          legacyQuery = legacyQuery.order('updated_at', { ascending: false });
        }

        const legacyRes = await legacyQuery.limit(limit);
        if (!legacyRes.error && legacyRes.data && legacyRes.data.length > 0) {
          data = legacyRes.data as any;
          error = null;
        }
      }

      if (!error && data && data.length > 0) {
        let profiles: Profile[] = data.map((row: any) => {
          const reactions = { fire: 0, eyes: 0, heart: 0, laugh: 0 };
          if (Array.isArray(row.reaction_counts)) {
            for (const r of row.reaction_counts) {
              if (r.reaction_type in reactions) {
                reactions[r.reaction_type as keyof typeof reactions] = r.count;
              }
            }
          }

          const categoryName = Array.isArray(row.categories)
            ? row.categories[0]?.name
            : row.categories?.name;

          // Convert cents to whole dollars at application boundary
          const activeValue = row.current_active_value_minor != null
            ? Math.floor(Number(row.current_active_value_minor) / 100)
            : Number(row.current_active_value || 0);

          return {
            id: row.id,
            seq: Number(row.ranking_sequence || row.sequence || 0),
            name: row.title || row.display_name || 'Anonymous Challenger',
            handle: row.handle,
            category: (categoryName || 'Tech') as Category,
            active_value: activeValue,
            imageUrl: row.image_path,
            linkUrl: row.destination_url,
            owner_id: row.user_id || undefined,
            peak_rank: row.current_rank || 100,
            times_bumped: 1,
            times_climbed: 1,
            views: 500,
            shares: 20,
            joined_days_ago: 1,
            last_bump_at: Date.now() - 3600000,
            journey: [row.current_rank || 100],
            reactions,
          };
        });

        if (sort === 'popular') {
          profiles.sort((a, b) => {
            const sumA = (a.reactions.fire || 0) + (a.reactions.eyes || 0) + (a.reactions.heart || 0) + (a.reactions.laugh || 0);
            const sumB = (b.reactions.fire || 0) + (b.reactions.eyes || 0) + (b.reactions.heart || 0) + (b.reactions.laugh || 0);
            return sumB - sumA || b.active_value - a.active_value;
          });
        }

        const payload = {
          profiles,
          total: profiles.length,
          sort,
          category: category || 'All',
          purchasesPaused: false,
        };

        const rawJson = JSON.stringify(payload);
        boardMemoryCache.set(cacheKey, { rawJson, data: payload, timestamp: now });

        return new NextResponse(rawJson, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
            'X-Cache': 'MISS',
          },
        });
      }
    }

    // Fallback: In-memory simulation with all 3 sorting modes (Power, Popular, Trending)
    let pool = [...getFallbackProfiles()];

    if (category && category !== 'All') {
      pool = pool.filter((p) => p.category === category);
    }

    if (sort === 'popular') {
      pool.sort((a, b) => {
        const totalA = (a.reactions.fire || 0) + (a.reactions.eyes || 0) + (a.reactions.heart || 0) + (a.reactions.laugh || 0);
        const totalB = (b.reactions.fire || 0) + (b.reactions.eyes || 0) + (b.reactions.heart || 0) + (b.reactions.laugh || 0);
        return totalB - totalA || b.active_value - a.active_value;
      });
    } else if (sort === 'trending') {
      pool.sort((a, b) => {
        const recencyA = a.last_bump_at || 0;
        const recencyB = b.last_bump_at || 0;
        return recencyB - recencyA || b.active_value - a.active_value;
      });
    } else {
      pool = sortBoard(pool);
    }

    const fallbackPayload = {
      profiles: pool.slice(0, limit),
      total: pool.length,
      sort,
      category: category || 'All',
      purchasesPaused: false,
    };

    const rawJson = JSON.stringify(fallbackPayload);
    boardMemoryCache.set(cacheKey, { rawJson, data: fallbackPayload, timestamp: now });

    return new NextResponse(rawJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        'X-Cache': 'FALLBACK',
      },
    });
  } catch (err: any) {
    console.error('Error fetching board:', err);
    return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 });
  }
}
