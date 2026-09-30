import { NextRequest, NextResponse } from 'next/server';
import { verifyDodoWebhook } from '@/lib/dodo';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers = { 'webhook-id': request.headers.get('webhook-id') || '', 'webhook-timestamp': request.headers.get('webhook-timestamp') || '', 'webhook-signature': request.headers.get('webhook-signature') || '' };
  let event: any;
  try { event = verifyDodoWebhook(rawBody, headers); }
  catch { return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 }); }
  try {
    const type = event.type || event.event_type;
    const payload = event.data || event;
    const eventId = headers['webhook-id'];
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

    if (type === 'refund.succeeded') {
      const paymentId = payload.payment_id || payload.id;
      if (!paymentId) return NextResponse.json({ error: 'Missing payment id for refund' }, { status: 400 });

      const { data, error } = await supabaseAdmin.rpc('process_dodo_refund', {
        p_event_id: eventId,
        p_payment_id: paymentId,
        p_payload: payload,
      });

      if (error) {
        console.error('Refund processing failed', error);
        return NextResponse.json({ error: 'Refund processing failed' }, { status: 500 });
      }

      invalidateBoardCache();
      return NextResponse.json({ success: true, result: data });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    console.error('Webhook execution failed', error);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}
