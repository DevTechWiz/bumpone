import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createDodoCheckoutSession } from '@/lib/dodo';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MIN_TOP_UP } from '@/lib/board';

const PurchaseCreateSchema = z.object({
  userId: z.string().optional(),
  mode: z.enum(['new', 'top_up', 'existing']).default('new'),
  profileId: z.string().optional(),
  topUpAmount: z.number().min(MIN_TOP_UP, `Minimum top-up is $${MIN_TOP_UP}`),
  currentValue: z.number().default(0),
  targetRank: z.number().optional(),
  title: z.string().min(1).max(100),
  handle: z.string().min(1).max(50),
  linkUrl: z.string().url().startsWith('https://', { message: 'URL must start with https://' }),
  imageUrl: z.string().min(1),
  category: z.string().default('Tech'),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const result = PurchaseCreateSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid purchase parameters', details: result.error.format() },
        { status: 400 }
      );
    }

    const {
      userId: clientUserId,
      mode: rawMode,
      profileId,
      topUpAmount,
      currentValue,
      targetRank,
      title,
      handle,
      linkUrl,
      imageUrl,
      category,
    } = result.data;

    const mode = rawMode === 'existing' ? 'top_up' : rawMode;

    // Detect authenticated user ID from server session (preferred) or request body
    let authenticatedUserId = clientUserId;
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        authenticatedUserId = user.id;
      }
    } catch {
      // Unauthenticated session, proceed with guest or client-supplied ID
    }

    // Check system state
    try {
      const { data: sys } = await supabaseAdmin
        .from('system_state')
        .select('purchases_paused')
        .eq('id', 'global')
        .single();

      if (sys?.purchases_paused) {
        return NextResponse.json(
          { error: 'Purchases are temporarily paused for maintenance.' },
          { status: 503 }
        );
      }
    } catch {
      // Continue if table not yet migrated
    }

    const resultingValue = currentValue + topUpAmount;
    const amountMinor = Math.round(topUpAmount * 100);

    const quoteId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const origin = request.nextUrl.origin || 'http://localhost:3000';
    const returnUrl = `${origin}/?status=pending_payment&quote_id=${quoteId}`;

    // Create Dodo Checkout Session
    const session = await createDodoCheckoutSession({
      amountMinor,
      returnUrl,
      metadata: {
        project_id: profileId,
        profile_id: profileId,
        user_id: authenticatedUserId,
        quote_id: quoteId,
        target_rank: targetRank?.toString(),
        resulting_value: resultingValue.toString(),
        title,
        handle,
        link_url: linkUrl,
        image_url: imageUrl,
        category,
        mode,
      },
    });

    return NextResponse.json({
      quote_id: quoteId,
      checkout_url: session.checkoutUrl,
      session_id: session.sessionId,
      resulting_value: resultingValue,
      top_up_amount: topUpAmount,
    });
  } catch (err: any) {
    console.error('Error creating purchase session:', err);
    return NextResponse.json({ error: err.message || 'Failed to create checkout' }, { status: 500 });
  }
}
