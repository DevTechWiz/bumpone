import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  const [
    { count: activeProfiles },
    { count: openReports },
    { data: payments },
  ] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('moderation_status', 'approved'),
    supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabaseAdmin
      .from('payments')
      .select('amount_minor')
      .eq('status', 'paid'),
  ]);

  const totalRevenue = Math.round(
    ((payments as Array<{ amount_minor: number | string }> | null) || []).reduce(
      (n: number, p) => n + Number(p.amount_minor || 0),
      0
    ) / 100
  );

  return NextResponse.json({
    totalRevenue,
    activeProfiles: activeProfiles || 0,
    openReports: openReports || 0,
    purchasesPaused: process.env.PURCHASES_PAUSED === 'true',
  });
}
