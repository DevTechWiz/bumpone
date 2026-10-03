import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { BumpEvent, SlotItem } from '@/lib/slotTypes';

export async function GET(request: NextRequest) {
  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (!isSupabaseConfigured) {
      return NextResponse.json({ events: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('board_events')
      .select(`
        id,
        event_sequence,
        project_id,
        project_title_snapshot,
        project_handle_snapshot,
        previous_rank,
        new_rank,
        previous_active_value_minor,
        new_active_value_minor,
        profiles_displaced,
        event_type,
        created_at,
        projects(title, handle, image_path, destination_url, current_active_value_minor)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching board events:', error);
      return NextResponse.json({ error: 'Failed to fetch board events' }, { status: 500 });
    }

    const events: BumpEvent[] = (data || []).map((row: any) => {
      const proj = row.projects || {};
      const title = row.project_title_snapshot || proj.title || 'Contender';
      const handle = row.project_handle_snapshot || proj.handle || '@unknown';
      const amountPaid = Math.floor(Number(row.new_active_value_minor || 0) / 100);
      const prevAmount = Math.floor(Number(row.previous_active_value_minor || 0) / 100);
      const imageUrl = proj.image_path || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80';
      const linkUrl = proj.destination_url || 'https://bumpone.lol';
      const timestamp = new Date(row.created_at).getTime();

      const promotedItem: SlotItem = {
        id: row.project_id || row.id,
        rank: row.new_rank,
        imageUrl,
        linkUrl,
        title,
        bidderName: handle.startsWith('@') ? handle : `@${handle}`,
        amountPaid,
        createdAt: timestamp,
      };

      const droppedItem: SlotItem = {
        id: `dropped-${row.id}`,
        rank: (row.previous_rank ?? row.new_rank) + 1,
        imageUrl,
        linkUrl,
        title: 'Displaced Contender',
        bidderName: '@displaced',
        amountPaid: prevAmount,
        createdAt: timestamp,
      };

      return {
        id: row.id,
        timestamp,
        promotedItem,
        droppedItem,
        previousRank: row.previous_rank ?? (row.new_rank + 1),
        newRank: row.new_rank,
      };
    });

    return NextResponse.json({ events });
  } catch (err: any) {
    console.error('Failed to load board events:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
