import { supabaseAdmin } from './supabase/admin';
import type { Profile, Category } from './board';

export async function getProject(id: string): Promise<Profile | null> {
  if (!id) return null;

  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (!isSupabaseConfigured) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const cleanHandle = id.startsWith('@') ? id : `@${id}`;
    const plainHandle = id.startsWith('@') ? id.slice(1) : id;

    let query = supabaseAdmin
      .from('projects')
      .select(`
        id,
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
        image_pos_x,
        image_pos_y,
        image_zoom,
        views_count,
        created_at,
        updated_at,
        categories(name),
        users(id, handle, display_name, avatar_url, bio)
      `);

    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.or(`handle.eq.${cleanHandle},handle.eq.${plainHandle}`).order('current_rank', { ascending: true });
    }

    const { data: projectList, error } = await query.limit(1);
    const project = projectList && projectList.length > 0 ? projectList[0] : null;

    if (error || !project) return null;

    const reactions = {
      fire: Number((project as any).reactions_fire || 0),
      eyes: Number((project as any).reactions_eyes || 0),
      heart: Number((project as any).reactions_heart || 0),
      laugh: Number((project as any).reactions_laugh || 0),
    };

    const categoryName = Array.isArray((project as any).categories)
      ? (project as any).categories[0]?.name
      : (project as any).categories?.name;

    const activeValue = (project as any).current_active_value_minor != null
      ? Math.floor(Number((project as any).current_active_value_minor) / 100)
      : Number((project as any).current_active_value || 0);

    const owner = (project as any).users || {};
    const joinedDaysAgo = (project as any).created_at
      ? Math.max(0, Math.floor((Date.now() - new Date((project as any).created_at).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const lastBumpAt = (project as any).updated_at ? new Date((project as any).updated_at).getTime() : Date.now();

    return {
      id: project.id,
      seq: Number((project as any).ranking_sequence || 0),
      name: (project as any).title || 'Project',
      handle: project.handle,
      category: (categoryName || 'Tech') as Category,
      active_value: activeValue,
      imageUrl: (project as any).image_path || '',
      linkUrl: (project as any).destination_url || '',
      owner_id: owner.id || undefined,
      owner_name: owner.display_name || undefined,
      owner_handle: owner.handle || undefined,
      owner_avatar: owner.avatar_url || undefined,
      owner_bio: owner.bio || undefined,
      peak_rank: (project as any).current_rank || 100,
      views: Number((project as any).views_count || 0),
      shares: 0,
      times_bumped: 0,
      times_climbed: 0,
      joined_days_ago: joinedDaysAgo,
      last_bump_at: lastBumpAt,
      journey: [],
      reactions,
      imagePosX: (project as any).image_pos_x,
      imagePosY: (project as any).image_pos_y,
      imageZoom: (project as any).image_zoom,
    };
  } catch (e) {
    console.warn('Could not load project on server:', e);
    return null;
  }
}
