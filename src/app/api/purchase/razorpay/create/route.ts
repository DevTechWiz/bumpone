import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRazorpayOrder, getRazorpayCredentials, USD_TO_INR_RATE } from '@/lib/razorpay';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MIN_TOP_UP } from '@/lib/board';
import { allowRequest } from '@/lib/rateLimit';

const schema = z.object({
  mode: z.enum(['new', 'top_up']),
  projectId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
  topUpAmount: z.number().int().min(MIN_TOP_UP).max(100_000),
  targetRank: z.number().int().min(1).max(100),
  title: z.string().trim().min(1).max(100),
  handle: z.string().trim().min(1).max(50),
  linkUrl: z.string().url().refine((v) => new URL(v).protocol === 'https:', 'URL must use HTTPS'),
  imageUrl: z.string().url().max(2048),
  category: z.string().trim().min(1).max(50),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication is required' }, { status: 401 });
  if (!allowRequest(`checkout_rzp:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many checkout attempts' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const creds = getRazorpayCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'Razorpay is not configured on this server' }, { status: 503 });
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid purchase parameters', details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    if (process.env.PURCHASES_PAUSED === 'true') {
      return NextResponse.json({ error: 'Purchases are temporarily paused.' }, { status: 503 });
    }

    const { data: existingUser, error: existingUserError } = await supabaseAdmin.from('users').select('id, handle').eq('id', user.id).maybeSingle();
    if (existingUserError) throw new Error('Unable to verify user account');
    const cleanInputHandle = input.handle.replace(/^@/, '').trim().toLowerCase();

    if (!existingUser) {
      const { error: userError } = await supabaseAdmin.from('users').insert({
        id: user.id,
        handle: cleanInputHandle || String(user.user_metadata?.user_name || `user_${user.id.slice(0, 8)}`).slice(0, 50),
        display_name: String(user.user_metadata?.full_name || user.user_metadata?.name || 'BumpOne user').slice(0, 100),
      });
      if (userError) throw new Error('Unable to provision user account');
    } else if (cleanInputHandle && existingUser.handle !== cleanInputHandle) {
      await supabaseAdmin.from('users').update({
        handle: cleanInputHandle,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
    }

    const { data: category } = await supabaseAdmin.from('categories').select('id').eq('name', input.category).maybeSingle();
    if (!category) return NextResponse.json({ error: 'Unknown category' }, { status: 400 });

    let projectId = input.projectId || input.profileId;
    let currentValueMinor = 0;
    if (input.mode === 'top_up') {
      if (!projectId) return NextResponse.json({ error: 'Project ID is required for a top-up' }, { status: 400 });
      const { data: project } = await supabaseAdmin.from('projects').select('id,current_active_value_minor').eq('id', projectId).eq('user_id', user.id).maybeSingle();
      if (!project) return NextResponse.json({ error: 'Project not found or not owned by you' }, { status: 403 });
      currentValueMinor = Number(project.current_active_value_minor);
    } else {
      const { data: project, error } = await supabaseAdmin.from('projects').insert({
        user_id: user.id,
        title: input.title,
        handle: cleanInputHandle,
        image_path: input.imageUrl,
        destination_url: input.linkUrl,
        category_id: category.id,
        is_active: false,
        moderation_status: 'approved',
      }).select('id').single();
      if (error || !project) throw new Error('Unable to create draft project');
      projectId = project.id;
    }

    const { data: target } = await supabaseAdmin.from('projects').select('current_active_value_minor').eq('current_rank', input.targetRank).eq('is_active', true).eq('moderation_status', 'approved').maybeSingle();
    const targetValueMinor = target ? Number(target.current_active_value_minor) : (101 - input.targetRank) * 100;
    const requiredMinor = Math.max(MIN_TOP_UP * 100, targetValueMinor - currentValueMinor + MIN_TOP_UP * 100);
    const suppliedMinor = input.topUpAmount * 100; // in USD cents
    if (suppliedMinor < requiredMinor) return NextResponse.json({ error: `Minimum required top-up is $${requiredMinor / 100}` }, { status: 409 });

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { data: quote, error: quoteError } = await supabaseAdmin.from('purchase_quotes').insert({
      project_id: projectId,
      user_id: user.id,
      target_rank: input.targetRank,
      quoted_amount_minor: suppliedMinor,
      expected_rank: input.targetRank,
      expires_at: expiresAt,
      status: 'checkout_open',
    }).select('id').single();

    if (quoteError || !quote) {
      console.error('Failed to create payment quote:', quoteError);
      throw new Error('Unable to create payment quote');
    }

    // Convert USD cents to INR Paise: ($ amount) * USD_TO_INR_RATE * 100 paise
    const amountINR = (suppliedMinor / 100) * USD_TO_INR_RATE;
    const amountPaise = Math.round(amountINR * 100);

    const order = await createRazorpayOrder({
      amountPaise,
      receipt: quote.id,
      notes: {
        quote_id: quote.id,
        project_id: projectId || '',
        user_id: user.id,
        mode: input.mode,
      },
    });

    return NextResponse.json({
      quote_id: quote.id,
      order_id: order.id,
      amount: order.amount,
      currency: 'INR',
      amount_usd: suppliedMinor / 100,
      amount_inr: amountINR,
      key_id: creds.keyId,
      name: 'BumpOne',
      description: `Sponsored Billboard Placement (#${input.targetRank})`,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('Razorpay purchase creation failed', error);
    return NextResponse.json({ error: 'Unable to create Razorpay checkout order' }, { status: 500 });
  }
}
