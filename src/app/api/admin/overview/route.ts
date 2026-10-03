import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
export async function GET() {
  const auth = await requireAdmin(); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthenticated' ? 401 : 403 });
  const [{ count: activeProfiles }, { count: openReports }, { data: payments }, { data: state }] = await Promise.all([
    supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('moderation_status', 'approved'), supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'), supabaseAdmin.from('payments').select('amount_minor').eq('status', 'paid'), supabaseAdmin.from('system_state').select('purchases_paused').eq('id', 'global').single(),
  ]);
  return NextResponse.json({ totalRevenue: Math.round((payments || []).reduce((n, p) => n + Number(p.amount_minor), 0) / 100), activeProfiles: activeProfiles || 0, openReports: openReports || 0, purchasesPaused: Boolean(state?.purchases_paused) });
}
