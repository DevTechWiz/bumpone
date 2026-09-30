import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildProfiles } from '@/lib/board';

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
      // 1. Try querying 'projects' table (clean architecture)
      let { data: project, error } = await supabaseAdmin
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
          categories(name),
          reaction_counts(reaction_type, count),
          board_events(event_sequence, previous_rank, new_rank, created_at, profiles_displaced)
        `)
        .eq('id', id)
        .single();

      // Fallback if board_events or legacy schema differs
      if (error || !project) {
        const { data: fallbackProj, error: fallbackErr } = await supabaseAdmin
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
            categories(name),
            reaction_counts(reaction_type, count)
          `)
          .eq('id', id)
          .single();

        if (!fallbackErr && fallbackProj) {
          project = fallbackProj as any;
          error = null;
        }
      }

      if (!error && project) {
        const reactions = { fire: 0, eyes: 0, heart: 0, laugh: 0 };
        if (Array.isArray((project as any).reaction_counts)) {
          for (const r of (project as any).reaction_counts) {
            if (r.reaction_type in reactions) {
              reactions[r.reaction_type as keyof typeof reactions] = r.count;
            }
          }
        }

        const categoryName = Array.isArray((project as any).categories)
          ? (project as any).categories[0]?.name
          : (project as any).categories?.name;

        const activeValue = (project as any).current_active_value_minor != null
          ? Math.floor(Number((project as any).current_active_value_minor) / 100)
          : Number((project as any).current_active_value || 0);

        return NextResponse.json({
          id: project.id,
          name: (project as any).title || (project as any).display_name || 'Anonymous Challenger',
          handle: project.handle,
          category: categoryName || 'Tech',
          active_value: activeValue,
          total_paid: Math.round(Number(project.total_paid_minor || 0) / 100),
          imageUrl: project.image_path,
          linkUrl: project.destination_url,
          rank: project.current_rank,
          reactions,
          board_events: (project as any).board_events || (project as any).rank_events || [],
        });
      }
    }

    // Fallback: search in memory profiles
    const profiles = buildProfiles();
    const found = profiles.find((p) => p.id === id);

    if (!found) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: found.id,
      name: found.name,
      handle: found.handle,
      category: found.category,
      active_value: found.active_value,
      total_paid: found.active_value + (found.times_bumped * 15),
      imageUrl: found.imageUrl,
      linkUrl: found.linkUrl,
      rank: found.peak_rank,
      peak_rank: found.peak_rank,
      times_bumped: found.times_bumped,
      times_climbed: found.times_climbed,
      views: found.views,
      shares: found.shares,
      reactions: found.reactions,
      journey: found.journey,
    });
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
