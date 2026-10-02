import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { type Profile, type Category } from '@/lib/board';

import { boardMemoryCache, CACHE_TTL_MS } from '@/lib/boardCache';

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
      // Query projects table (clean 2026 schema with 0-join reaction columns)
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
        .lte('current_rank', 100);

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

      // Retry without relation embeds only; do not ever return mock data in production.
      if (error || !data || data.length === 0) {
        let legacyQuery = supabaseAdmin
          .from('projects')
          .select('*')
          .eq('is_active', true)
          .eq('moderation_status', 'approved')
          .not('current_rank', 'is', null)
          .lte('current_rank', 100);

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
        let profiles: Profile[] = data.map((row: any) => {
          const reactions = {
            fire: Number(row.reactions_fire ?? (Array.isArray(row.reaction_counts) ? row.reaction_counts.find((r: any) => r.reaction_type === 'fire')?.count : 0) ?? 0),
            eyes: Number(row.reactions_eyes ?? (Array.isArray(row.reaction_counts) ? row.reaction_counts.find((r: any) => r.reaction_type === 'eyes')?.count : 0) ?? 0),
            heart: Number(row.reactions_heart ?? (Array.isArray(row.reaction_counts) ? row.reaction_counts.find((r: any) => r.reaction_type === 'heart')?.count : 0) ?? 0),
            laugh: Number(row.reactions_laugh ?? (Array.isArray(row.reaction_counts) ? row.reaction_counts.find((r: any) => r.reaction_type === 'laugh')?.count : 0) ?? 0),
          };

          const categoryName = Array.isArray(row.categories)
            ? row.categories[0]?.name
            : row.categories?.name;

          // Convert cents to whole dollars at application boundary
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
            name: row.title || row.display_name || 'N/A',
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
            peak_rank: row.current_rank || 100,
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

      return NextResponse.json({
        profiles: [],
        total: 0,
        sort,
        category: category || 'All',
        purchasesPaused: false,
      }, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
        },
      });
    }

    return NextResponse.json({
      profiles: [],
      total: 0,
      sort,
      category: category || 'All',
      purchasesPaused: false,
    });
  } catch (err: any) {
    console.error('Error fetching board:', err);
    return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 });
  }
}
