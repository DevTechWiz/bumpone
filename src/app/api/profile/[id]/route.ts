import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
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
          total_reactions,
          categories(name),
          board_events(event_sequence, previous_rank, new_rank, created_at, profiles_displaced)
        `);

      if (isUuid) {
        query = query.eq('id', id);
      } else {
        query = query.or(`handle.eq.${cleanHandle},handle.eq.${plainHandle}`).order('current_rank', { ascending: true });
      }

      const { data: projectList, error: queryErr } = await query.limit(1);
      let project = projectList && projectList.length > 0 ? projectList[0] : null;
      let error = queryErr;

      // Fallback if board_events or legacy schema differs
      if (error || !project) {
        let fallbackQuery = supabaseAdmin
          .from('projects')
          .select(`
            id,
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
            categories(name)
          `);

        if (isUuid) {
          fallbackQuery = fallbackQuery.eq('id', id);
        } else {
          fallbackQuery = fallbackQuery.or(`handle.eq.${cleanHandle},handle.eq.${plainHandle}`).order('current_rank', { ascending: true });
        }

        const { data: fbList, error: fbErr } = await fallbackQuery.limit(1);
        if (!fbErr && fbList && fbList.length > 0) {
          project = fbList[0] as any;
          error = null;
        }
      }

      if (!error && project) {
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

        return NextResponse.json({
          id: project.id,
          name: (project as any).title || (project as any).display_name || 'Project',
          handle: project.handle,
          category: categoryName || 'Tech',
          active_value: activeValue,
          total_paid: Math.round(Number(project.total_paid_minor || 0) / 100),
          imageUrl: project.image_path,
          linkUrl: project.destination_url,
          rank: project.current_rank,
          reactions,
          board_events: (project as any).board_events || [],
        });
      }
    }

    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
