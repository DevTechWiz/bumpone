import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/urls';
import { readJsonWithLimit } from '@/lib/requestGuard';
import { allowRequest } from '@/lib/rateLimit';
import { securityLog } from '@/lib/securityLogger';

// Largest legit body = image_path data URI (zod cap 7_000_000 chars) + fields.
const MAX_BODY_BYTES = 7_200_000;

const IMAGE_RE = /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/;

const ProjectUpdateSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(100).nullish(),
  destination_url: z.string().trim().min(1).max(2048).nullish(),
  image_path: z.string().trim().min(1).max(7_000_000).nullish(),
});

function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && Boolean(u.hostname && u.hostname.includes('.'));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Session budget: project edits are rare; 30/min absorbs retry storms and
    // floods of 7.2 MB data-URI bodies (SEC-007/SEC-008).
    if (!allowRequest(`project_update:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
    }

    const body = await readJsonWithLimit(request, MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const parsed = ProjectUpdateSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid project data' }, { status: 400 });
    }
    const input = parsed.data;

    const payload: Record<string, unknown> = {};
    if (input.title !== undefined && input.title !== null) {
      payload.title = input.title;
    }
    if (input.destination_url !== undefined && input.destination_url !== null) {
      const normalized = normalizeUrl(input.destination_url);
      if (!isValidHttpsUrl(normalized)) {
        return NextResponse.json({ error: 'Link must be a valid HTTPS URL' }, { status: 400 });
      }
      payload.destination_url = normalized;
    }
    if (input.image_path !== undefined && input.image_path !== null) {
      if (!IMAGE_RE.test(input.image_path)) {
        return NextResponse.json({ error: 'Image must be an https URL or an uploaded image' }, { status: 400 });
      }
      payload.image_path = input.image_path;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // SEC-018: a destination URL change voids the approval the old link earned —
    // the new destination has never been reviewed. Re-pending drops the project
    // off the board until an admin approves it again. Rejected/suspended stays
    // as-is (already off the board); an already-pending project stays pending.
    let rePended = false;
    if (payload.destination_url !== undefined) {
      const { data: current, error: currentError } = await supabaseAdmin
        .from('projects')
        .select('destination_url, moderation_status')
        .eq('id', input.projectId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (currentError) {
        console.error('Project pre-read failed:', currentError.message);
        return NextResponse.json({ error: 'Unable to update project' }, { status: 500 });
      }
      // Ownership is part of the WHERE clause: a mismatched id writes nothing (SEC-010/IDOR).
      if (!current) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const urlChanged =
        payload.destination_url !== normalizeUrl(current.destination_url ?? '');
      if (urlChanged && current.moderation_status === 'approved') {
        payload.moderation_status = 'pending';
        payload.is_active = false;
        rePended = true;
      }
    }

    // Ownership is part of the WHERE clause: a mismatched id updates nothing (SEC-010/IDOR).
    const { data: rows, error: updateError } = await supabaseAdmin
      .from('projects')
      .update(payload)
      .eq('id', input.projectId)
      .eq('user_id', user.id)
      .select('id, title, handle, destination_url, image_path, moderation_status');

    if (updateError) {
      const msg = updateError.message || '';
      if (msg.includes('invalid_destination_url') || msg.includes('invalid_image_path') || msg.includes('invalid_title')) {
        return NextResponse.json({ error: 'Invalid project data' }, { status: 400 });
      }
      console.error('Project update failed:', updateError.message);
      return NextResponse.json({ error: 'Unable to update project' }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (rePended) {
      // Refill the vacated board slot; failure here is logged only — the URL
      // change itself already committed (same best-effort pattern as /api/admin/moderate).
      const { error: rankError } = await supabaseAdmin.rpc('recalculate_board_ranks');
      if (rankError) console.error('Board rank recalculation failed:', rankError.message);
      securityLog.moderationAction(
        'owner_url_change_repending',
        user.id,
        input.projectId,
        'pending',
        'destination_url changed by owner'
      );
    }

    return NextResponse.json({ project: rows[0] });
  } catch (err) {
    console.error('Project update error:', err);
    return NextResponse.json({ error: 'Unable to update project' }, { status: 500 });
  }
}
