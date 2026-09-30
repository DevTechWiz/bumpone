import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const pin = request.headers.get('x-admin-pin');
  const expectedPin = process.env.ADMIN_ACCESS_PIN || 'bumped2026admin';

  if (!pin || pin !== expectedPin) {
    return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
  }

  try {
    const { paused } = await request.json();

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      const { error } = await supabaseAdmin
        .from('system_state')
        .upsert({ id: 'global', purchases_paused: Boolean(paused), updated_at: new Date().toISOString() });

      if (error) {
        return NextResponse.json({ error: 'Failed to update system state' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, purchases_paused: Boolean(paused) });
  } catch (err: any) {
    console.error('Error toggling emergency state:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
