import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { allowRequest } from '@/lib/rateLimit';
import { readJsonWithLimit, newRequestId } from '@/lib/requestGuard';
import { normalizeUrl } from '@/lib/urls';
import { getDynamicBoardConfig } from '@/lib/boardConfig';
import { stripControlChars } from '@/lib/textSanitize';
import { securityLog } from '@/lib/securityLogger';
import { moderateProjectContent } from '@/lib/aiModeration';
import { invalidateBoardCache } from '@/lib/boardCache';

// Same allowlist enforced across checkout and image endpoints (SEC-022)
const IMAGE_RE = /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/;

const claimFreeSchema = z.object({
  title: z.string().transform(stripControlChars).pipe(z.string().trim().min(1).max(100)),
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
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((val) => IMAGE_RE.test(val), 'Image must be an https URL or an uploaded image'),
  category: z.string().trim().min(1).max(50),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    securityLog.authFailure('claim_free_unauthenticated');
    return NextResponse.json({ error: 'Please sign in to claim a free slot' }, { status: 401 });
  }

  // Rate limiting: 5 attempts per minute per user account
  if (!allowRequest(`claim_free:${user.id}`, 5, 60_000)) {
    securityLog.rateLimit('claim_free_rate_limit_exceeded', `claim_free:${user.id}`, undefined, 5, 60_000);
    return NextResponse.json({ error: 'Too many claim attempts. Please wait a minute.' }, { status: 429 });
  }

  const config = await getDynamicBoardConfig();

  if (config.purchasesPaused) {
    return NextResponse.json({ error: 'Slot claims are temporarily paused.' }, { status: 503 });
  }

  if (!config.freeClaimsEnabled) {
    return NextResponse.json(
      { error: `Free launch claims are currently disabled. A minimum $${config.minBumpUsd} top-up is required to claim a slot.` },
      { status: 403 }
    );
  }

  try {
    const body = await readJsonWithLimit(request, 64 * 1024);
    if (!body.ok) return body.response;

    const parsed = claimFreeSchema.safeParse(body.value);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join('.')).filter(Boolean);
      return NextResponse.json({ error: 'Invalid project parameters', fields: [...new Set(fields)] }, { status: 400 });
    }
    const input = parsed.data;

    // Guard 1: One free claimed project per user account
    const { data: userProjects, error: userProjError } = await supabaseAdmin
      .from('projects')
      .select('id, moderation_status')
      .eq('user_id', user.id)
      .limit(1);

    if (userProjError) {
      throw new Error('Unable to verify user project history');
    }

    if (userProjects && userProjects.length > 0) {
      return NextResponse.json(
        { error: `You have already claimed a slot with this account. Additional slots or rank bumps require a $${config.minBumpUsd} top-up.` },
        { status: 403 }
      );
    }

    // Guard 2: Free claims are only valid while under the dynamic free claims limit
    const { count: activeCount, error: countError } = await supabaseAdmin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('moderation_status', 'approved');

    if (countError) {
      throw new Error('Unable to verify active board capacity');
    }

    if ((activeCount || 0) >= config.freeClaimsLimit) {
      return NextResponse.json(
        { error: `Free launch capacity reached (${config.freeClaimsLimit} slots limit). Free claims are now closed — you must bump a slot ($${config.minBumpUsd} min) to enter.` },
        { status: 409 }
      );
    }

    // Ensure category exists
    const { data: category } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('name', input.category)
      .maybeSingle();

    if (!category) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
    }

    // Provision or verify public user profile
    const sanitizedInputHandle = input.handle
      .replace(/^@/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30);
    const fallbackHandle = `user_${user.id.slice(0, 8)}`;

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, handle')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingUser) {
      const chosenHandle = sanitizedInputHandle.length >= 2 ? sanitizedInputHandle : fallbackHandle;
      await supabaseAdmin.from('users').insert({
        id: user.id,
        handle: chosenHandle,
        display_name: stripControlChars(String(user.user_metadata?.full_name || user.user_metadata?.name || 'BumpOne Creator')).slice(0, 100),
      });
    }

    // 7. Automated AI Safety Evaluation (Gemini 2.5 Flash / OpenRouter)
    const finalHandle = sanitizedInputHandle.length >= 2 ? sanitizedInputHandle : fallbackHandle;
    const aiResult = await moderateProjectContent({
      title: input.title,
      handle: finalHandle,
      destinationUrl: input.linkUrl,
      imageUrl: input.imageUrl,
    });

    if (aiResult.verdict === 'rejected') {
      securityLog.moderationAction(
        'free_claim_ai_rejected',
        user.id,
        'rejected',
        'rejected',
        `AI rejected submission: ${aiResult.reason}`
      );
      return NextResponse.json(
        { error: `Submission rejected by AI content moderation: ${aiResult.reason}` },
        { status: 400 }
      );
    }

    const isAutoApproved = aiResult.verdict === 'approved';

    // Insert project into database:
    // If AI approves with high confidence, project goes live immediately!
    // If AI is unsure or keys are pending, it queues safely for manual admin review.
    const { data: newProject, error: insertError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        title: input.title,
        handle: finalHandle,
        image_path: input.imageUrl,
        destination_url: input.linkUrl,
        category_id: category.id,
        current_active_value_minor: 0,
        total_paid_minor: 0,
        ranking_sequence: Date.now(),
        is_active: isAutoApproved,
        moderation_status: isAutoApproved ? 'approved' : 'pending',
      })
      .select('id')
      .single();

    if (insertError || !newProject) {
      console.error('Failed to insert free project:', insertError);
      throw new Error('Unable to record free slot claim');
    }

    if (isAutoApproved) {
      await supabaseAdmin.rpc('recalculate_board_ranks');
      invalidateBoardCache();
    }

    securityLog.moderationAction(
      isAutoApproved ? 'free_slot_ai_approved' : 'free_slot_claimed_pending',
      user.id,
      newProject.id,
      isAutoApproved ? 'approved' : 'pending',
      `AI Moderation (${aiResult.provider}): ${aiResult.reason}`
    );

    return NextResponse.json({
      success: true,
      approved: isAutoApproved,
      message: isAutoApproved
        ? '🎉 Free slot claimed! Verified by AI and live on the board.'
        : 'Free slot claimed! Queued for manual admin review.',
      project_id: newProject.id,
    });
  } catch (error: any) {
    const requestId = newRequestId();
    console.error('Free slot claim error:', requestId, error);
    return NextResponse.json({ error: error?.message || 'Unable to claim slot', request_id: requestId }, { status: 500 });
  }
}
