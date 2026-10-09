import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getHandleCooldownRemainingDays } from '@/lib/board';
import { normalizeUrl } from '@/lib/urls';
import { readJsonWithLimit, newRequestId } from '@/lib/requestGuard';
import { allowRequest } from '@/lib/rateLimit';
import { stripControlChars } from '@/lib/textSanitize';

// Largest legit body = avatar_url data URI (zod cap 2_000_000 chars) + fields.
const MAX_BODY_BYTES = 2_200_000;

const HANDLE_RE = /^[a-z0-9_]{2,30}$/;
const AVATAR_RE = /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/;

const ProfileUpdateSchema = z.object({
  // Strip control/bidi characters BEFORE length validation (same pattern as
  // messageSchema/ReportSchema, Phase 4) — bios and display names render
  // everywhere on the board and must not carry invisible/spoofing text.
  display_name: z
    .string()
    .transform(stripControlChars)
    .pipe(z.string().trim().min(1).max(100))
    .nullish(),
  handle: z.string().trim().min(1).max(50).nullish(),
  bio: z
    .string()
    .transform(stripControlChars)
    .pipe(z.string().trim().max(500))
    .nullish(),
  avatar_url: z.string().trim().max(2_000_000).nullish(),
  website: z.string().trim().max(500).nullish(),
  twitter: z.string().trim().max(50).nullish(),
  github: z.string().trim().max(50).nullish(),
});

const SELECT_FIELDS =
  'id, handle, display_name, bio, avatar_url, website, twitter, github, handle_last_changed_at';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Session budget: profile edits are rare; 30/min absorbs retry storms and
    // floods of 2.2 MB data-URI bodies (SEC-007/SEC-008).
    if (!allowRequest(`profile_update:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
    }

    const body = await readJsonWithLimit(request, MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const parsed = ProfileUpdateSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 });
    }
    const input = parsed.data;

    const { data: current, error: currentError } = await supabaseAdmin
      .from('users')
      .select(SELECT_FIELDS)
      .eq('id', user.id)
      .maybeSingle();
    if (currentError) {
      const requestId = newRequestId();
      console.error('Profile update: failed to load user:', requestId, currentError.message);
      return NextResponse.json({ error: 'Unable to update profile', request_id: requestId }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const payload: Record<string, unknown> = {};
    if (input.display_name !== undefined && input.display_name !== null) {
      payload.display_name = input.display_name;
    }
    if (input.bio !== undefined) payload.bio = input.bio; // null clears
    if (input.twitter !== undefined) {
      payload.twitter = input.twitter === null ? null : input.twitter.replace(/^@/, '');
    }
    if (input.github !== undefined) payload.github = input.github;

    if (input.avatar_url !== undefined && input.avatar_url !== null) {
      if (!AVATAR_RE.test(input.avatar_url)) {
        return NextResponse.json({ error: 'Avatar must be an https URL or an uploaded image' }, { status: 400 });
      }
      payload.avatar_url = input.avatar_url;
    } else if (input.avatar_url === null) {
      payload.avatar_url = null;
    }

    if (input.website !== undefined && input.website !== null && input.website !== '') {
      const normalized = normalizeUrl(input.website);
      let ok = false;
      try {
        const u = new URL(normalized);
        ok = u.protocol === 'https:' && Boolean(u.hostname && u.hostname.includes('.'));
      } catch {
        ok = false;
      }
      if (!ok) {
        return NextResponse.json({ error: 'Website must be a valid HTTPS URL' }, { status: 400 });
      }
      payload.website = normalized;
    } else if (input.website !== undefined) {
      payload.website = input.website === '' ? null : input.website;
    }

    if (input.handle !== undefined && input.handle !== null) {
      const newHandle = input.handle.replace(/^@/, '').trim().toLowerCase();
      const currentHandle = (current.handle || '').replace(/^@/, '').trim().toLowerCase();

      if (newHandle !== currentHandle) {
        if (!newHandle || newHandle.length < 2) {
          return NextResponse.json({ error: 'Handle must be at least 2 characters long.' }, { status: 400 });
        }
        if (newHandle.length > 30) {
          return NextResponse.json({ error: 'Handle cannot exceed 30 characters.' }, { status: 400 });
        }
        if (!HANDLE_RE.test(newHandle)) {
          return NextResponse.json(
            { error: 'Handle can only contain letters, numbers, and underscores.' },
            { status: 400 }
          );
        }

        // 30-day cooldown is enforced by the DB trigger; pre-check for a friendly error
        const daysRemaining = getHandleCooldownRemainingDays(current.handle_last_changed_at);
        if (daysRemaining > 0) {
          return NextResponse.json(
            {
              error: `Handles can only be changed once every 30 days. Next edit in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
              days_remaining: daysRemaining,
            },
            { status: 409 }
          );
        }

        const { data: taken } = await supabaseAdmin
          .from('users')
          .select('id')
          .ilike('handle', newHandle)
          .neq('id', user.id)
          .maybeSingle();
        if (taken) {
          return NextResponse.json({ error: 'This @handle is already taken.' }, { status: 409 });
        }

        payload.handle = newHandle;
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ user: current });
    }

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('users')
      .update(payload)
      .eq('id', user.id)
      .select(SELECT_FIELDS);

    if (updateError) {
      const msg = updateError.message || '';
      if (msg.includes('handle_cooldown_active')) {
        const daysRemaining = getHandleCooldownRemainingDays(current.handle_last_changed_at);
        return NextResponse.json(
          {
            error: `Handles can only be changed once every 30 days. Next edit in ${daysRemaining || 30} day${(daysRemaining || 30) === 1 ? '' : 's'}.`,
            days_remaining: daysRemaining,
          },
          { status: 409 }
        );
      }
      if (msg.includes('invalid_handle')) {
        return NextResponse.json(
          { error: 'Handle can only contain letters, numbers, and underscores.' },
          { status: 400 }
        );
      }
      if (msg.includes('invalid_website_scheme')) {
        return NextResponse.json({ error: 'Website must be a valid HTTPS URL' }, { status: 400 });
      }
      if ((updateError as any).code === '23505' || msg.includes('duplicate key')) {
        return NextResponse.json({ error: 'This @handle is already taken.' }, { status: 409 });
      }
      const requestId = newRequestId();
      console.error('Profile update failed:', requestId, updateError.message);
      return NextResponse.json({ error: 'Unable to update profile', request_id: requestId }, { status: 500 });
    }

    return NextResponse.json({ user: updatedRows && updatedRows[0] ? updatedRows[0] : current });
  } catch (err) {
    const requestId = newRequestId();
    console.error('Profile update error:', requestId, err);
    return NextResponse.json({ error: 'Unable to update profile', request_id: requestId }, { status: 500 });
  }
}
