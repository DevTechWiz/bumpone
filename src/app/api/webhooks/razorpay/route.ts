import { NextRequest, NextResponse } from 'next/server';
import { verifyRazorpayWebhookSignature } from '@/lib/razorpay';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';

  if (!signature) {
    return NextResponse.json({ error: 'Missing x-razorpay-signature header' }, { status: 400 });
  }

  const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.error('Invalid Razorpay webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const eventId = event.payload?.payment?.entity?.id || event.payload?.order?.entity?.id || `rzp_${Date.now()}`;

    // Handle payment.captured or order.paid
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity;
      const orderEntity = event.payload?.order?.entity;

      const paymentId = paymentEntity?.id || eventId;
      const orderId = paymentEntity?.order_id || orderEntity?.id;
      const notes = paymentEntity?.notes || orderEntity?.notes || {};

      let quoteId = notes.quote_id;
      let projectId = notes.project_id;

      // Look up quote if needed
      let quoteAmountMinor = 1000; // default $10 in cents
      if (quoteId) {
        const { data: quote } = await supabaseAdmin
          .from('purchase_quotes')
          .select('id, project_id, quoted_amount_minor, status')
          .eq('id', quoteId)
          .maybeSingle();

        if (quote) {
          quoteAmountMinor = Number(quote.quoted_amount_minor);
          if (!projectId) projectId = quote.project_id;
        }
      }

      const { data, error } = await supabaseAdmin.rpc('process_dodo_purchase', {
        p_event_id: `rzp_${eventId}`,
        p_payment_id: paymentId,
        p_amount_minor: quoteAmountMinor,
        p_payload: {
          gateway: 'razorpay',
          order_id: orderId,
          payment_id: paymentId,
          amount_paise: paymentEntity?.amount || orderEntity?.amount,
          currency: 'INR',
          raw_event: event,
        },
        p_quote_id: quoteId || null,
        p_project_id: projectId || null,
      });

      if (error) {
        console.error('Razorpay purchase processing RPC failed:', error);
        return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 });
      }

      invalidateBoardCache();
      return NextResponse.json({ success: true, result: data });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    console.error('Razorpay webhook execution error:', error);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}
