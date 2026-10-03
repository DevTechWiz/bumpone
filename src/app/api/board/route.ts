import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { type Profile, type Category } from '@/lib/board';
import {
  boardMemoryCache,
  CACHE_TTL_MS,
  getInFlightFetch,
  setInFlightFetch,
  clearInFlightFetch,
  type BoardCacheEntry,
} from '@/lib/boardCache';

function computeETag(profiles: Profile[]): string {
  if (!profiles || profiles.length === 0) return 'W/"empty-0"';
  const top = profiles[0];
  const last = profiles[profiles.length - 1];
  const sumReactions = profiles.slice(0, 10).reduce(
    (acc, p) => acc + (p.reactions?.fire || 0) + (p.reactions?.heart || 0),
    0
  );
  return `W/"${profiles.length}-${top?.id || 'none'}-${top?.active_value || 0}-${top?.seq || 0}-${last?.id || 'none'}-${last?.active_value || 0}-${sumReactions}"`;
}

async function fetchAndCacheBoard(
  sort: string,
  category: string | null,
  limit: number,
  cacheKey: string
): Promise<BoardCacheEntry> {
  const now = Date.now();
  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
  );

  if (isSupabaseConfigured) {
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
        image_pos_x,
        image_pos_y,
        image_zoom,
        views_count,
        created_at,
        updated_at,
        reactions_fire,
        reactions_eyes,
        reactions_heart,
        reactions_laugh,
        total_reactions,
        categories!inner(name),
        users(id, handle, display_name, avatar_url, bio)
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
        image_pos_x,
        image_pos_y,
        image_zoom,
        views_count,
        created_at,
        updated_at,
        reactions_fire,
        reactions_eyes,
        reactions_heart,
        reactions_laugh,
        total_reactions,
        categories(name),
        users(id, handle, display_name, avatar_url, bio)
      `;

    let query = supabaseAdmin
      .from('projects')
      .select(selectFieldsProject)
      .eq('is_active', true)
      .eq('moderation_status', 'approved')
      .not('current_rank', 'is', null)
      .lte('current_rank', limit);

    if (category && category !== 'All') {
      query = query.eq('categories.name', category);
    }

    if (sort === 'popular') {
      query = query.order('total_reactions', { ascending: false }).order('current_active_value_minor', { ascending: false });
    } else if (sort === 'trending') {
      query = query.order('updated_at', { ascending: false }).order('current_active_value_minor', { ascending: false });
    } else {
      query = query.order('current_active_value_minor', { ascending: false }).order('ranking_sequence', { ascending: true });
    }

    const { data: projectData, error: projectErr } = await query.limit(limit);
    let data: any[] | null = projectData as any;
    let error = projectErr;

    // Fallback without relation embeds
    if (error || !data || data.length === 0) {
      let legacyQuery = supabaseAdmin
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .eq('moderation_status', 'approved')
        .not('current_rank', 'is', null)
        .lte('current_rank', limit);

      if (sort === 'popular') {
        legacyQuery = legacyQuery.order('total_reactions', { ascending: false });
      } else if (sort === 'trending') {
        legacyQuery = legacyQuery.order('updated_at', { ascending: false });
      }

      const legacyRes = await legacyQuery.limit(limit);
      if (!legacyRes.error && legacyRes.data && legacyRes.data.length > 0) {
        data = legacyRes.data as any;
        error = null;
      }
    }

    if (!error && data && data.length > 0) {
      const profiles: Profile[] = data.map((row: any) => {
        const reactions = {
          fire: Number(row.reactions_fire ?? 0),
          eyes: Number(row.reactions_eyes ?? 0),
          heart: Number(row.reactions_heart ?? 0),
          laugh: Number(row.reactions_laugh ?? 0),
        };

        const categoryName = Array.isArray(row.categories)
          ? row.categories[0]?.name
          : row.categories?.name;

        const activeValue = row.current_active_value_minor != null
          ? Math.floor(Number(row.current_active_value_minor) / 100)
          : Number(row.current_active_value || 0);

        const views = Number(row.views_count || 0);
        const joinedDaysAgo = row.created_at
          ? Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        const lastBumpAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
        const owner = row.users || {};

        return {
          id: row.id,
          seq: Number(row.ranking_sequence || row.sequence || 0),
          name: row.title || row.display_name || 'Project',
          handle: row.handle,
          category: (categoryName || 'Tech') as Category,
          active_value: activeValue,
          imageUrl: row.image_path,
          linkUrl: row.destination_url,
          owner_id: row.user_id || undefined,
          owner_name: owner.display_name || undefined,
          owner_handle: owner.handle || undefined,
          owner_avatar: owner.avatar_url || undefined,
          owner_bio: owner.bio || undefined,
          peak_rank: row.current_rank || 101,
          times_bumped: 0,
          times_climbed: 0,
          views,
          shares: 0,
          joined_days_ago: joinedDaysAgo,
          last_bump_at: lastBumpAt,
          imagePosX: row.image_pos_x,
          imagePosY: row.image_pos_y,
          imageZoom: row.image_zoom,
          journey: row.current_rank ? [row.current_rank] : [],
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
      const etag = computeETag(profiles);
      const entry: BoardCacheEntry = { rawJson, data: payload, timestamp: now, etag };
      boardMemoryCache.set(cacheKey, entry);
      return entry;
    }
  }

  const fallbackPayload = {
    profiles: [],
    total: 0,
    sort,
    category: category || 'All',
    purchasesPaused: false,
  };
  const rawJson = JSON.stringify(fallbackPayload);
  const etag = 'W/"empty-0"';
  const entry: BoardCacheEntry = { rawJson, data: fallbackPayload, timestamp: now, etag };
  boardMemoryCache.set(cacheKey, entry);
  return entry;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get('sort') || 'power';
  const category = searchParams.get('category');
  const limit = Math.min(120, Math.max(1, Number(searchParams.get('limit')) || 100));

  const cacheKey = `${sort}:${category || 'All'}:${limit}`;
  const now = Date.now();
  const cached = boardMemoryCache.get(cacheKey);
  const ifNoneMatch = request.headers.get('if-none-match');

  // Cache hit: serve from memory in < 2ms, zero Supabase queries
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (ifNoneMatch && cached.etag && ifNoneMatch === cached.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': cached.etag,
          'Cache-Control': 'public, max-age=5, s-maxage=15, stale-while-revalidate=60',
          'X-Cache': 'HIT-304',
        },
      });
    }

    return new NextResponse(cached.rawJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'ETag': cached.etag,
        'Cache-Control': 'public, max-age=5, s-maxage=15, stale-while-revalidate=60',
        'X-Cache': 'HIT',
      },
    });
  }

  // Stampede protection: if a query is already running, join the in-flight promise
  let fetchPromise = getInFlightFetch(cacheKey);
  if (!fetchPromise) {
    fetchPromise = fetchAndCacheBoard(sort, category, limit, cacheKey);
    setInFlightFetch(cacheKey, fetchPromise);
  }

  try {
    const entry = await fetchPromise;
    if (ifNoneMatch && entry.etag && ifNoneMatch === entry.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': entry.etag,
          'Cache-Control': 'public, max-age=5, s-maxage=15, stale-while-revalidate=60',
          'X-Cache': 'MISS-304',
        },
      });
    }

    return new NextResponse(entry.rawJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'ETag': entry.etag,
        'Cache-Control': 'public, max-age=5, s-maxage=15, stale-while-revalidate=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    console.error('Error fetching board:', err);
    return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 });
  } finally {
    clearInFlightFetch(cacheKey);
  }
}
