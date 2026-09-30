import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const pin = request.headers.get('x-admin-pin');
  const expectedPin = process.env.ADMIN_ACCESS_PIN || 'bumped2026admin';

  if (!pin || pin !== expectedPin) {
    return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
  }

  try {
    const { profileId, status, reason } = await request.json();

    if (!profileId || !['approved', 'suspended', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid moderation parameters' }, { status: 400 });
    }

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      let { error: updateErr } = await supabaseAdmin
        .from('projects')
        .update({
          moderation_status: status,
          is_active: status === 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId);

      if (updateErr) {
        // Fallback to legacy profiles
        const { error: legacyErr } = await supabaseAdmin
          .from('profiles')
          .update({
            moderation_status: status,
            is_active: status === 'approved',
            updated_at: new Date().toISOString(),
          })
          .eq('id', profileId);

        if (legacyErr) {
          return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 });
        }
      }

      // If slot was suspended or rejected, compact the ranks to remove gaps
      if (status !== 'approved') {
        await supabaseAdmin.rpc('recalculate_board_ranks');
      }

      // Log admin action to decoupled audit trail
      await supabaseAdmin.from('admin_actions').insert({
        admin_identifier: 'admin_pin',
        action: `profile_${status}`,
        target_id: profileId,
        reason: reason || 'Moderator action via PIN',
      });
    }

    return NextResponse.json({ success: true, profileId, status });
  } catch (err: any) {
    console.error('Error executing moderation action:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
