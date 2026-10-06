import { NextRequest, NextResponse } from 'next/server';
import { verifyDodoWebhook } from '@/lib/dodo';
import { parsePaymentSucceeded } from '@/lib/paymentEvents';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';
import { bodyTooLarge } from '@/lib/requestGuard';

import { securityLog } from '@/lib/securityLogger';
import { clientIp } from '@/lib/requestGuard';

// Deterministic rejections (malformed/non-USD/DB validation failures) return 200 with
// success:false so the provider does not retry something that can never succeed.
// Nothing is credited on any non-success path — the database RPC is the final authority.

const MAX_WEBHOOK_BYTES = 1024 * 1024; // webhooks are small; cap before buffering (SEC-008)

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

      const { data, error } = await supabaseAdmin.rpc('process_dodo_purchase', {
        p_event_id: eventId,
        p_payment_id: paymentId,
        p_amount_minor: amountMinor,
        p_payload: payload,
        p_quote_id: quoteId,
        p_project_id: projectId,
      });

      if (error) {
        securityLog.financialError('payment_rpc_failed', error.message, { eventId, paymentId, quoteId, projectId });
        console.error('Payment processing failed', error);
        return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 });
      }

      const status = (data as { status?: string } | null)?.status;
      if (status === 'success') {
        invalidateBoardCache();
        securityLog.paymentSuccess(paymentId, eventId, projectId || 'unknown', amountMinor);
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
    securityLog.financialError('webhook_unexpected_exception', error?.message || 'Unknown error');
    console.error('Webhook execution failed', error);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}
