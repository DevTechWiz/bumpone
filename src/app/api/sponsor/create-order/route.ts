import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRazorpayOrder, getRazorpayCredentials } from '@/lib/razorpay';
import { createDodoCheckoutSession } from '@/lib/dodo';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { allowRequest } from '@/lib/rateLimit';

const schema = z.object({
  plan: z.enum(['starter', 'featured', 'hero']).default('starter'),
  title: z.string().trim().min(1).max(100),
  url: z.string().url().refine((v) => new URL(v).protocol === 'https:', 'URL must use HTTPS'),
  category: z.string().trim().min(1).max(50),
  email: z.string().email(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  gateway: z.enum(['dodo', 'razorpay']).default('dodo'),
});

const PLAN_PRICES_INR: Record<string, number> = {
  starter: 199,
  featured: 499,
  hero: 999,
};

const PLAN_PRICES_USD_MINOR: Record<string, number> = {
  starter: 299, // $2.99
  featured: 599, // $5.99
  hero: 1199, // $11.99
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!allowRequest(`sponsor_order:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid billboard spot details', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { plan, title, url, category, email, imageUrl, gateway } = parsed.data;

    // Provision draft project record so webhook can activate it upon payment
    let projectId: string | undefined;
    try {
      const { data: cat } = await supabaseAdmin
        .from('categories')
        .select('id')
        .ilike('name', category)
        .maybeSingle();

      let categoryId = cat?.id;
      if (!categoryId) {
        const { data: firstCat } = await supabaseAdmin.from('categories').select('id').limit(1).maybeSingle();
        categoryId = firstCat?.id;
      }

      if (categoryId) {
        const cleanHandle = (email.split('@')[0] || 'sponsor').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
        const { data: draftProj } = await supabaseAdmin.from('projects').insert({
          title,
          handle: cleanHandle || 'sponsor',
          image_path: imageUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80",
          destination_url: url,
          category_id: categoryId,
          is_active: false,
          moderation_status: 'approved',
        }).select('id').single();

        if (draftProj) {
          projectId = draftProj.id;
        }
      }
    } catch (e) {
      console.warn('Draft project creation skipped or failed:', e);
    }

    // Handle Dodo Payments (International / USD)
    if (gateway === 'dodo') {
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const amountMinor = PLAN_PRICES_USD_MINOR[plan] || 299;

      const session = await createDodoCheckoutSession({
        amountMinor,
        returnUrl: `${appUrl}/?status=sponsor_success&plan=${plan}&title=${encodeURIComponent(title)}`,
        metadata: {
          mode: 'new',
          project_id: projectId,
          title,
          link_url: url,
          category,
          image_url: imageUrl || '',
        },
      });

      return NextResponse.json({
        success: true,
        gateway: 'dodo',
        checkout_url: session.checkoutUrl,
        session_id: session.sessionId,
        amount_usd: (amountMinor / 100).toFixed(2),
        plan,
      });
    }

    // Handle Razorpay (Domestic India / INR)
    const creds = getRazorpayCredentials();
    if (!creds) {
      return NextResponse.json(
        { error: 'Razorpay gateway is currently unavailable. Please select Dodo Payments for card payment.' },
        { status: 503 }
      );
    }

    const amountInr = PLAN_PRICES_INR[plan] || 199;
    const amountPaise = amountInr * 100;
    const receipt = `spon_${Date.now().toString().slice(-8)}_${Math.random().toString(36).slice(2, 6)}`;

    const order = await createRazorpayOrder({
      amountPaise,
      receipt,
      notes: {
        product: 'Digital Showcase Slot',
        plan,
        project_id: projectId || '',
        project_title: title,
        project_url: url,
        category,
        sponsor_email: email,
        banner_url: imageUrl || '',
      },
    });

    return NextResponse.json({
      success: true,
      gateway: 'razorpay',
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: creds.keyId,
      plan,
      amount_inr: amountInr,
    });
  } catch (error: any) {
    console.error('Error creating sponsor checkout order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate digital billboard spot booking.' },
      { status: 500 }
    );
  }
}
