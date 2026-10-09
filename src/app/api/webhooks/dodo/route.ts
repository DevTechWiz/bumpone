import { NextRequest, NextResponse } from 'next/server';
import { verifyDodoWebhook } from '@/lib/dodo';
import { parsePaymentSucceeded } from '@/lib/paymentEvents';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';
import { bodyTooLarge, newRequestId } from '@/lib/requestGuard';

import { securityLog } from '@/lib/securityLogger';
import { clientIp } from '@/lib/requestGuard';
import { dispatchOutbidAlerts } from '@/lib/rankAlerts';

// Deterministic rejections (malformed/non-USD/DB validation failures) return 200 with
// success:false so the provider does not retry something that can never succeed.
// Nothing is credited on any non-success path — the database RPC is the final authority.

const MAX_WEBHOOK_BYTES = 1024 * 1024; // webhooks are small; cap before buffering (SEC-008)

// payment_events ledger idempotency for non-succeeded events (docs/10):
// payment.succeeded records its row inside process_dodo_purchase; the state-
// mutating branches below check + record here. The unique
// (provider, provider_event_id) constraint makes replay a no-op.
async function eventAlreadyRecorded(eventId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('payment_events')
      .select('id')
      .eq('provider', 'dodo')
      .eq('provider_event_id', eventId)
      .limit(1);
    return Boolean(data && data.length > 0);
  } catch {
    return false;
  }
}

async function recordProviderEvent(
  eventId: string,
  eventType: string,
  paymentId: string | null,
  payload: unknown
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('payment_events').insert({
      provider: 'dodo',
      provider_event_id: eventId,
      payment_id: paymentId || null,
      event_type: eventType,
      payload,
    });
    // 23505 = unique violation: a concurrent duplicate delivery already recorded it.
    if (error && error.code !== '23505') {
      console.error('payment_events record failed:', error.message);
    }
  } catch (err: any) {
    console.error('payment_events record failed:', err?.message || err);
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (bodyTooLarge(request, MAX_WEBHOOK_BYTES)) {
    securityLog.paymentFailure('webhook_payload_too_large', undefined, undefined, 'Payload exceeded 1MB cap', { ip });
    return NextResponse.json({ error: 'Webhook payload too large' }, { status: 413 });
  }
  const rawBody = await request.text();
  const webhookId = request.headers.get('webhook-id') || request.headers.get('svix-id') || '';
  const webhookTimestamp = request.headers.get('webhook-timestamp') || request.headers.get('svix-timestamp') || '';
  const webhookSignature = request.headers.get('webhook-signature') || request.headers.get('svix-signature') || '';

  const headers: Record<string, string> = {
    'webhook-id': webhookId,
    'webhook-timestamp': webhookTimestamp,
    'webhook-signature': webhookSignature,
    'svix-id': webhookId,
    'svix-timestamp': webhookTimestamp,
    'svix-signature': webhookSignature,
  };
  let event: any;
  try {
    event = verifyDodoWebhook(rawBody, headers);
  } catch {
    securityLog.authFailure('dodo_webhook_signature_invalid', ip, 'Invalid webhook signature');
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }
  try {
    const type = event.type || event.event_type;
    const payload = event.data || event;
    const eventId = webhookId;
    if (!eventId) {
      securityLog.paymentFailure('dodo_webhook_missing_id', undefined, undefined, 'Missing webhook id');
      return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });
    }

    if (type === 'payment.succeeded') {
      const parsed = parsePaymentSucceeded(payload);
      if (!parsed.ok) {
        securityLog.paymentFailure('dodo_webhook_pre_rpc_rejection', eventId, undefined, parsed.reason);
        console.error(`Dodo webhook ${eventId} rejected before processing: ${parsed.reason}`);
        return NextResponse.json({ success: false, ignored: true, reason: parsed.reason });
      }
      const { paymentId, amountMinor, quoteId, projectId } = parsed.value;

      const normalizedPayload = {
        ...(typeof payload === 'object' && payload !== null ? payload : {}),
        currency: 'USD',
        customer_currency: (payload as Record<string, unknown>)?.currency,
        customer_total_amount: (payload as Record<string, unknown>)?.total_amount,
      };

      const { data, error } = await supabaseAdmin.rpc('process_dodo_purchase', {
        p_event_id: eventId,
        p_payment_id: paymentId,
        p_amount_minor: amountMinor,
        p_payload: normalizedPayload,
        p_quote_id: quoteId,
        p_project_id: projectId,
      });

      if (error) {
        const requestId = newRequestId();
        securityLog.financialError('payment_rpc_failed', error.message, { eventId, paymentId, quoteId, projectId, requestId });
        console.error('Payment processing failed', requestId, error);
        return NextResponse.json({ error: 'Payment processing failed', request_id: requestId }, { status: 500 });
      }

      const status = (data as { status?: string } | null)?.status;
      if (status === 'success') {
        invalidateBoardCache();
        securityLog.paymentSuccess(paymentId, eventId, projectId || 'unknown', amountMinor);

        // Dispatches transactional outbid and graveyard rank alerts (non-blocking)
        const targetNewRank = (data as { new_rank?: number } | null)?.new_rank || 1;
        dispatchOutbidAlerts({
          paymentId,
          promotedProjectId: projectId || '',
          newRank: targetNewRank,
          amountMinor,
        }).catch((err) => console.warn('[Dodo Webhook] Outbid alerts dispatch error:', err));

        return NextResponse.json({ success: true, result: data });
      }
      if (status === 'already_processed') {
        securityLog.paymentReplay(eventId, paymentId);
        return NextResponse.json({ success: true, already_processed: true });
      }
      // Deterministic database-side rejection (expired quote, amount mismatch,
      // quote/user/project mismatch, duplicate payment, ...): no credit granted.
      securityLog.paymentFailure('payment_rpc_rejection', eventId, paymentId, (data as { message?: string } | null)?.message);
      console.error(`Dodo webhook ${eventId} rejected by database:`, data);
      return NextResponse.json({
        success: false,
        reason: (data as { message?: string } | null)?.message || 'rejected',
      });
    }

    if (type === 'payment.failed') {
      // No application credit exists for a failed checkout: flip a ledger row if
      // one somehow exists, otherwise cancel the still-open quote so the quote
      // state machine reflects the failure (docs/10 event mapping).
      if (await eventAlreadyRecorded(eventId)) {
        return NextResponse.json({ success: true, already_processed: true });
      }
      const meta: Record<string, unknown> =
        typeof payload.metadata === 'object' && payload.metadata !== null
          ? (payload.metadata as Record<string, unknown>)
          : {};
      const paymentId =
        (typeof payload.payment_id === 'string' && payload.payment_id) ||
        (typeof payload.id === 'string' && payload.id) ||
        (typeof meta.payment_id === 'string' && meta.payment_id) ||
        '';
      const quoteId = typeof meta.quote_id === 'string' ? meta.quote_id : '';

      let handled = false;
      try {
        if (paymentId) {
          const { data: payRows } = await supabaseAdmin
            .from('payments')
            .update({ status: 'failed' })
            .eq('provider', 'dodo')
            .eq('provider_payment_id', paymentId)
            .eq('status', 'paid')
            .select('id');
          handled = Boolean(payRows && payRows.length > 0);
        }
        if (!handled && quoteId) {
          const { data: quoteRows } = await supabaseAdmin
            .from('purchase_quotes')
            .update({ status: 'cancelled' })
            .eq('id', quoteId)
            .eq('status', 'checkout_open')
            .select('id');
          handled = Boolean(quoteRows && quoteRows.length > 0);
        }
      } catch (failErr: any) {
        console.error('payment.failed handling failed:', failErr?.message || failErr);
      }
      await recordProviderEvent(eventId, type, paymentId || null, payload);
      securityLog.paymentFailure('payment_failed', eventId, paymentId || undefined, type, {
        quoteId: quoteId || undefined,
        ledgerMarked: handled,
      });
      return NextResponse.json({ success: true, handled: 'payment_failed' });
    }

    if (type === 'dispute.opened') {
      // docs/10 Chargebacks & Disputes: mark the purchase disputed; the admin
      // dashboard surfaces disputed counts and suspension stays a manual action.
      if (await eventAlreadyRecorded(eventId)) {
        return NextResponse.json({ success: true, already_processed: true });
      }
      const meta: Record<string, unknown> =
        typeof payload.metadata === 'object' && payload.metadata !== null
          ? (payload.metadata as Record<string, unknown>)
          : {};
      const paymentId =
        (typeof payload.payment_id === 'string' && payload.payment_id) ||
        (typeof payload.id === 'string' && payload.id) ||
        (typeof meta.payment_id === 'string' && meta.payment_id) ||
        '';

      let disputed = false;
      try {
        if (paymentId) {
          const { data: payRows } = await supabaseAdmin
            .from('payments')
            .update({ status: 'disputed' })
            .eq('provider', 'dodo')
            .eq('provider_payment_id', paymentId)
            .in('status', ['paid', 'chargeback'])
            .select('id');
          disputed = Boolean(payRows && payRows.length > 0);
        }
      } catch (disputeErr: any) {
        console.error('dispute.opened handling failed:', disputeErr?.message || disputeErr);
      }
      await recordProviderEvent(eventId, type, paymentId || null, payload);
      securityLog.paymentFailure('payment_disputed', eventId, paymentId || undefined, type, {
        ledgerMarked: disputed,
      });
      return NextResponse.json({ success: true, handled: 'dispute_opened' });
    }

    if (type === 'refund.succeeded' || type === 'payment.dispute') {
      // BumpOne does not process application-level refunds.
      // Gateway chargebacks are handled externally by Dodo/Stripe.
      // Log for audit trail only.
      securityLog.paymentFailure('refund_or_dispute_unsupported', eventId, undefined, type);
      console.warn(`Received ${type} webhook — no application action taken`, { eventId });
      return NextResponse.json({ success: true, ignored: true, reason: 'refunds_not_supported' });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error: any) {
    const requestId = newRequestId();
    securityLog.financialError('webhook_unexpected_exception', error?.message || 'Unknown error', { requestId });
    console.error('Webhook execution failed', requestId, error);
    return NextResponse.json({ error: 'Internal webhook error', request_id: requestId }, { status: 500 });
  }
}
