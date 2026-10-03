import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyRazorpayPaymentSignature } from '@/lib/razorpay';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateBoardCache } from '@/lib/boardCache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const schema = z.object({
  quoteId: z.string().uuid(),
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid verification parameters', details: parsed.error.flatten() }, { status: 400 });
    }

    const { quoteId, orderId, paymentId, signature } = parsed.data;

    // Cryptographically verify Razorpay HMAC SHA256 payment signature
    const isValid = verifyRazorpayPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValid) {
      console.error('Invalid Razorpay signature verification attempt:', { orderId, paymentId });
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    // Retrieve quote to get verified USD cent equity amount
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('purchase_quotes')
      .select('id, project_id, user_id, quoted_amount_minor, status')
      .eq('id', quoteId)
      .maybeSingle();

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Payment quote not found' }, { status: 404 });
    }

    // Authoritative slot takeover & ranking update via RPC
    const { data, error } = await supabaseAdmin.rpc('process_dodo_purchase', {
      p_event_id: `rzp_verify_${paymentId}`,
      p_payment_id: paymentId,
      p_amount_minor: Number(quote.quoted_amount_minor),
      p_payload: {
        gateway: 'razorpay',
        order_id: orderId,
        payment_id: paymentId,
        verified_via: 'client_signature',
      },
      p_quote_id: quote.id,
      p_project_id: quote.project_id,
    });

    if (error) {
      console.error('Failed to process Razorpay purchase RPC:', error);
      return NextResponse.json({ error: 'Failed to update billboard ranking' }, { status: 500 });
    }

    invalidateBoardCache();
    return NextResponse.json({ success: true, result: data });
  } catch (error) {
    console.error('Razorpay verification error:', error);
    return NextResponse.json({ error: 'Internal verification error' }, { status: 500 });
  }
}
