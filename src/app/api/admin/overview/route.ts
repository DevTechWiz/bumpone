import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { isPurchasesPaused } from '@/lib/pauseState';
import { allowRequest } from '@/lib/rateLimit';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  if (!allowRequest(`admin_overview:${auth.user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const [
    { count: activeProfiles },
    { count: openReports },
    { data: paidPayments },
    { count: totalProfiles },
    { count: totalPurchases },
    { count: failedPayments },
    { count: disputedPayments },
    { count: pendingProjects },
    { data: topRows },
    { data: moderationRows },
    { data: recentPayments },
    { data: recentReports },
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
    // docs/15: total profiles (all projects regardless of moderation state).
    supabaseAdmin
      .from('projects')
      .select('*', { count: 'exact', head: true }),
    // docs/15: total purchases + failed payments + chargebacks.
    supabaseAdmin
      .from('payments')
      .select('*', { count: 'exact', head: true }),
    // docs/15/22: failed payments — a failed checkout never writes a payments
    // row (the ledger is only written on success, docs/10), so failed checkouts
    // are counted from quotes the webhook cancelled on payment.failed.
    supabaseAdmin
      .from('purchase_quotes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled'),
    supabaseAdmin
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['disputed', 'chargeback']),
    // docs/15: moderation queue (pending projects awaiting review).
    supabaseAdmin
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('moderation_status', 'pending'),
    // docs/15: current top 100 + active-value range.
    supabaseAdmin
      .from('projects')
      .select('id, title, handle, current_rank, current_active_value_minor')
      .eq('is_active', true)
      .eq('moderation_status', 'approved')
      .order('current_active_value_minor', { ascending: false })
      .order('ranking_sequence', { ascending: true })
      .limit(100),
    // docs/15: moderation queue entries the admin can act on directly.
    supabaseAdmin
      .from('projects')
      .select('id, title, handle, created_at')
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
    // docs/15 Purchase Controls: session, status, amount, target, final
    // position, timestamp, profile.
    supabaseAdmin
      .from('payments')
      .select('amount_minor, status, created_at, new_rank, provider_checkout_id, provider_payment_id, projects(title, handle), purchase_quotes(target_rank)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('reports')
      .select('id, reason, details, status, created_at, projects(title, handle)')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const paidRows = (paidPayments as Array<{ amount_minor: number | string }> | null) || [];
  const paidMinor = paidRows.reduce(
    (n: number, p) => n + Number(p.amount_minor || 0),
    0
  );
  const totalRevenue = Math.round(paidMinor / 100);
  const successfulPayments = paidRows.length;
  const averagePayment = successfulPayments ? Math.round(paidMinor / successfulPayments / 100) : 0;

  type TopRow = {
    id?: string;
    title?: string;
    handle?: string;
    current_rank?: number | null;
    current_active_value_minor?: number | string;
  };
  const top100 = ((topRows as TopRow[] | null) || []).map((row, index) => ({
    rank: row.current_rank ?? index + 1,
    id: row.id,
    title: row.title,
    handle: row.handle,
    active_value: Math.floor(Number(row.current_active_value_minor || 0) / 100),
  }));
  const values = top100.map((p) => p.active_value);
  const valueRange = values.length
    ? { min: Math.min(...values), max: Math.max(...values) }
    : null;

  type PaymentRow = {
    amount_minor?: number | string;
    status?: string;
    created_at?: string;
    new_rank?: number | null;
    provider_checkout_id?: string | null;
    provider_payment_id?: string | null;
    projects?: { title?: string; handle?: string } | { title?: string; handle?: string }[];
    purchase_quotes?: { target_rank?: number } | { target_rank?: number }[];
  };
  const recentPurchases = ((recentPayments as PaymentRow[] | null) || []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const quote = Array.isArray(row.purchase_quotes) ? row.purchase_quotes[0] : row.purchase_quotes;
    return {
      amount: Number(row.amount_minor || 0) / 100,
      status: row.status || 'unknown',
      created_at: row.created_at || null,
      final_rank: row.new_rank ?? null,
      target_rank: quote?.target_rank ?? null,
      checkout_session: row.provider_checkout_id || row.provider_payment_id || null,
      profile: project?.title || null,
      profile_handle: project?.handle || null,
    };
  });

  type ReportRow = {
    id?: string;
    reason?: string;
    details?: string | null;
    status?: string;
    created_at?: string;
    projects?: { title?: string } | { title?: string }[];
  };
  const reports = ((recentReports as ReportRow[] | null) || []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    return {
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      created_at: row.created_at,
      profile: project?.title || null,
    };
  });

  return NextResponse.json(
    {
      totalRevenue,
      activeProfiles: activeProfiles || 0,
      openReports: openReports || 0,
      purchasesPaused: await isPurchasesPaused(),
      totalProfiles: totalProfiles || 0,
      totalPurchases: totalPurchases || 0,
      successfulPayments,
      averagePayment,
      failedPayments: failedPayments || 0,
      chargebacks: disputedPayments || 0,
      moderationQueueCount: pendingProjects || 0,
      valueRange,
      top100,
      moderationQueue: moderationRows || [],
      recentPurchases,
      recentReports: reports,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
