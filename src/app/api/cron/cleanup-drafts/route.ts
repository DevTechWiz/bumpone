import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { allowRequest } from '@/lib/rateLimit';
import { newRequestId } from '@/lib/requestGuard';

/**
 * GET /api/cron/cleanup-drafts
 *
 * Hygiene sweeper for abandoned checkouts (draft projects + dead quotes
 * pile up when buyers retry or abandon payment). Secured by shared secret:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Fails closed when CRON_SECRET is unset. Only touches rows that can never
 * convert to money:
 *  1. checkout_open quotes past expires_at → expired (forward-only transition)
 *  2. expired/cancelled quotes older than 24h with no payment → deleted
 *  3. pending + inactive + unpaid draft projects older than 60min with no
 *     remaining quotes and no payments → deleted
 *
 * Never deletes: paid quotes, quotes with payments, active/approved projects,
 * or anything with financial history.
 */

const DRAFT_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes
const DEAD_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_LIMIT = 200;

// List-style reads (await + limit, no maybeSingle): tolerates duplicate rows
// and stays compatible with chainable-limit query builders.
const hasRows = (data: unknown): boolean =>
  Array.isArray(data) ? data.length > 0 : data != null;
const toList = <T,>(data: unknown): T[] =>
  (Array.isArray(data) ? data : []) as T[];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cleanup is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!allowRequest('cron:cleanup-drafts', 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const now = new Date();
    const draftCutoff = new Date(now.getTime() - DRAFT_MAX_AGE_MS).toISOString();
    const deadQuoteCutoff = new Date(now.getTime() - DEAD_QUOTE_MAX_AGE_MS).toISOString();

    // 1. Expire stale open quotes (forward-only: checkout_open → expired).
    const { data: expiredQuotes, error: expireError } = await supabaseAdmin
      .from('purchase_quotes')
      .update({ status: 'expired' })
      .eq('status', 'checkout_open')
      .lt('expires_at', now.toISOString())
      .select('id');
    if (expireError) throw new Error(`Unable to expire stale quotes: ${expireError.message}`);

    // 2. Delete dead quotes (expired/cancelled, old, no payment ever recorded).
    const { data: deadQuotes, error: deadError } = await supabaseAdmin
      .from('purchase_quotes')
      .select('id')
      .in('status', ['expired', 'cancelled'])
      .lt('created_at', deadQuoteCutoff)
      .limit(BATCH_LIMIT);
    if (deadError) throw new Error(`Unable to list dead quotes: ${deadError.message}`);
    let deletedQuotes = 0;
    for (const quote of toList<{ id: string }>(deadQuotes)) {
      const { data: paymentRows } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('quote_id', quote.id)
        .limit(1);
      if (hasRows(paymentRows)) continue;
      const { error: deleteError } = await supabaseAdmin
        .from('purchase_quotes')
        .delete()
        .eq('id', quote.id);
      if (!deleteError) deletedQuotes += 1;
    }

    // 3. Delete orphan drafts (never paid, nothing left referencing them).
    const { data: drafts, error: draftsError } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('is_active', false)
      .eq('moderation_status', 'pending')
      .eq('total_paid_minor', 0)
      .lt('created_at', draftCutoff)
      .limit(BATCH_LIMIT);
    if (draftsError) throw new Error(`Unable to list orphan drafts: ${draftsError.message}`);
    let deletedDrafts = 0;
    for (const draft of toList<{ id: string }>(drafts)) {
      const { data: quoteRows } = await supabaseAdmin
        .from('purchase_quotes')
        .select('id')
        .eq('project_id', draft.id)
        .limit(1);
      if (hasRows(quoteRows)) continue;
      const { data: paymentRows } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('project_id', draft.id)
        .limit(1);
      if (hasRows(paymentRows)) continue;
      const { error: deleteError } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', draft.id);
      if (!deleteError) deletedDrafts += 1;
    }

    return NextResponse.json({
      success: true,
      expiredQuotes: (expiredQuotes as unknown[])?.length || 0,
      deletedQuotes,
      deletedDrafts,
    });
  } catch (error) {
    const requestId = newRequestId();
    console.error('Draft cleanup failed', requestId, error);
    return NextResponse.json({ error: 'Cleanup failed', request_id: requestId }, { status: 500 });
  }
}
