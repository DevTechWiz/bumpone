import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { allowRequest } from '@/lib/rateLimit';
import { readJsonWithLimit, newRequestId } from '@/lib/requestGuard';
import { stripControlChars } from '@/lib/textSanitize';
import { securityLog } from '@/lib/securityLogger';
import { invalidateBoardCache } from '@/lib/boardCache';

const configSchema = z.object({
  freeClaimsEnabled: z.boolean().optional(),
  freeClaimsLimit: z.number().int().min(1).max(100).optional(),
  minBumpUsd: z.number().int().min(1).max(1000).optional(),
  reason: z.string().transform(stripControlChars).pipe(z.string().trim().min(3).max(500)),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    securityLog.authzFailure('admin_config_update_unauthorized');
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  if (!allowRequest(`admin_config:${auth.user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = await readJsonWithLimit(request, 8 * 1024);
  if (!body.ok) return body.response;

  const parsed = configSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 });
  }

  const updates: Record<string, any> = {
    id: 'global',
    updated_by: auth.user.id,
  };
  if (parsed.data.freeClaimsEnabled !== undefined) {
    updates.free_claims_enabled = parsed.data.freeClaimsEnabled;
  }
  if (parsed.data.freeClaimsLimit !== undefined) {
    updates.free_claims_limit = parsed.data.freeClaimsLimit;
  }
  if (parsed.data.minBumpUsd !== undefined) {
    updates.min_bump_usd = parsed.data.minBumpUsd;
  }

  const { error: updateError } = await supabaseAdmin.from('system_state').upsert(updates);
  if (updateError) {
    const requestId = newRequestId();
    console.error('Config update failed:', requestId, updateError.message);
    return NextResponse.json({ error: 'Unable to update config', request_id: requestId }, { status: 500 });
  }

  // Audit log
  await supabaseAdmin.from('admin_audit_log').insert({
    admin_user_id: auth.user.id,
    admin_identifier: auth.user.id,
    action: 'board_config_updated',
    target_type: 'system',
    target_id: 'global',
    reason: parsed.data.reason,
    metadata: updates,
  });

  // Invalidate cached board so edge clients immediately get the updated state
  invalidateBoardCache();

  securityLog.adminAction('board_config_updated', auth.user.id, 'global', { updates, reason: parsed.data.reason });

  return NextResponse.json({ success: true, config: updates });
}
