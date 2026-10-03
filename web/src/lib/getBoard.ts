import { supabaseAdmin } from './supabase/admin';
import { type Profile, type Category, sortBoard } from './board';
import { boardMemoryCache, CACHE_TTL_MS } from './boardCache';

export async function getBoardProfiles(limit: number = 120): Promise<Profile[]> {
  const cacheKey = `server_ssr:All:${limit}`;
  const now = Date.now();
  const cached = boardMemoryCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data?.profiles || [];
  }

  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (!isSupabaseConfigured) return [];

    const selectFields = `
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

    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(selectFields)
      .eq('is_active', true)
      .eq('moderation_status', 'approved')
      .not('current_rank', 'is', null)
      .order('current_active_value_minor', { ascending: false })
      .order('ranking_sequence', { ascending: true })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    const profiles: Profile[] = data.map((row: any) => {
      const reactions = {
        fire: Number(row.reactions_fire || 0),
        eyes: Number(row.reactions_eyes || 0),
        heart: Number(row.reactions_heart || 0),
        laugh: Number(row.reactions_laugh || 0),
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

    const etag = profiles.length > 0 ? `W/"${profiles.length}-${profiles[0].id}-${profiles[0].active_value}"` : 'W/"empty"';
    boardMemoryCache.set(cacheKey, {
      rawJson: JSON.stringify({ profiles }),
      data: { profiles },
      timestamp: now,
      etag,
    });

    return profiles;
  } catch (err) {
    console.warn('Could not fetch server-side board profiles:', err);
    return [];
  }
}
