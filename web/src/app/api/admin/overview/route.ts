import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const pin = request.headers.get('x-admin-pin') || request.nextUrl.searchParams.get('pin');
  const expectedPin = process.env.ADMIN_ACCESS_PIN || 'bumped2026admin';

  if (!pin || pin !== expectedPin) {
    return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
  }

  try {
    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      let projectsCountRes = await supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }).eq('is_active', true);
      let projectsCount = projectsCountRes.count;

      if (projectsCount === null) {
        const legacyRes = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true);
        projectsCount = legacyRes.count;
      }

      const [
        { count: reportsCount },
        { data: sys }
      ] = await Promise.all([
        supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabaseAdmin.from('system_state').select('purchases_paused').eq('id', 'global').single(),
      ]);

      let paymentsRes = await supabaseAdmin.from('payments').select('amount_minor').eq('status', 'paid');
      if (paymentsRes.error || !paymentsRes.data) {
        paymentsRes = await supabaseAdmin.from('purchases').select('amount_minor').eq('status', 'paid');
      }

      const totalRevenueMinor = (paymentsRes.data || []).reduce((acc: number, p: any) => acc + Number(p.amount_minor || 0), 0);

      return NextResponse.json({
        totalRevenue: Math.round(totalRevenueMinor / 100),
        activeProfiles: projectsCount || 0,
        openReports: reportsCount || 0,
        purchasesPaused: Boolean(sys?.purchases_paused),
      });
    }

    // Fallback metrics in local mock mode
    return NextResponse.json({
      totalRevenue: 5050,
      activeProfiles: 100,
      openReports: 0,
      purchasesPaused: false,
    });
  } catch (err: any) {
    console.error('Error fetching admin overview:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
