import { NextRequest, NextResponse } from 'next/server';
import { verifyDodoWebhook } from '@/lib/dodo';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';

export async function POST(request: NextRequest) {
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
  try { event = verifyDodoWebhook(rawBody, headers); }
  catch { return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 }); }
  try {
    const type = event.type || event.event_type;
    const payload = event.data || event;
    const eventId = webhookId;
    if (!eventId) return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });

    if (type === 'payment.succeeded') {
      const quoteId = payload.metadata?.quote_id;
      const paymentId = payload.payment_id || payload.id;
      const amountMinor = Number(payload.amount || payload.total_amount);
      if (!paymentId || !Number.isSafeInteger(amountMinor)) return NextResponse.json({ error: 'Malformed payment event' }, { status: 400 });

      const { data, error } = await supabaseAdmin.rpc('process_dodo_purchase', {
        p_event_id: eventId,
        p_payment_id: paymentId,
        p_amount_minor: amountMinor,
        p_payload: payload,
        p_quote_id: quoteId || null,
        p_project_id: payload.metadata?.project_id || null,
      });

      if (error) {
        console.error('Payment processing failed', error);
        return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 });
      }

      invalidateBoardCache();
      return NextResponse.json({ success: true, result: data });
    }

    if (type === 'refund.succeeded' || type === 'payment.dispute') {
      // BumpOne does not process application-level refunds.
      // Gateway chargebacks are handled externally by Dodo/Stripe.
      // Log for audit trail only.
      console.warn(`Received ${type} webhook — no application action taken`, { eventId });
      return NextResponse.json({ success: true, ignored: true, reason: 'refunds_not_supported' });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    console.error('Webhook execution failed', error);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}
