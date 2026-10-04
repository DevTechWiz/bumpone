import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createDodoCheckoutSession } from '@/lib/dodo';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MIN_TOP_UP } from '@/lib/board';
import { allowRequest } from '@/lib/rateLimit';
import { normalizeUrl } from '@/lib/urls';

const schema = z.object({
  mode: z.enum(['new', 'top_up']),
  projectId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
  topUpAmount: z.number().int().min(MIN_TOP_UP).max(100_000),
  targetRank: z.number().int().min(1).max(100),
  title: z.string().trim().min(1).max(100),
  handle: z.string().trim().min(1).max(50),
  linkUrl: z
    .string()
    .trim()
    .min(1)
    .transform((val) => normalizeUrl(val))
    .refine((val) => {
      try {
        const u = new URL(val);
        return u.protocol === 'https:' && Boolean(u.hostname && u.hostname.includes('.'));
      } catch {
        return false;
      }
    }, 'Valid website destination URL is required (must use HTTPS)'),
  imageUrl: z.string().url().max(2048),
  category: z.string().trim().min(1).max(50),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication is required' }, { status: 401 });
  if (!allowRequest(`checkout:${user.id}`, 5, 60_000)) return NextResponse.json({ error: 'Too many checkout attempts' }, { status: 429, headers: { 'Retry-After': '60' } });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid purchase parameters', details: parsed.error.flatten() }, { status: 400 });
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
      // Update handle in users table if creator updated their handle
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
    const rawTargetValueMinor = target ? Number(target.current_active_value_minor) : 0;
    const targetValueMinor = target ? Math.max(MIN_TOP_UP * 100, rawTargetValueMinor) : 0;
    const requiredMinor = target
      ? Math.max(MIN_TOP_UP * 100, targetValueMinor - currentValueMinor + (MIN_TOP_UP * 100))
      : MIN_TOP_UP * 100;
    const suppliedMinor = input.topUpAmount * 100;
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

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (process.env.NODE_ENV === 'production' && !appUrl.startsWith('https://')) {
      throw new Error('APP_URL must use HTTPS in production');
    }

    const session = await createDodoCheckoutSession({
      amountMinor: suppliedMinor,
      returnUrl: `${appUrl}/?status=pending_payment&quote_id=${quote.id}`,
      metadata: {
        quote_id: quote.id,
        project_id: projectId,
        user_id: user.id,
        mode: input.mode,
      },
    });
    return NextResponse.json({ quote_id: quote.id, checkout_url: session.checkoutUrl, session_id: session.sessionId, expires_at: expiresAt });
  } catch (error) {
    console.error('Purchase checkout creation failed', error);
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 });
  }
}
