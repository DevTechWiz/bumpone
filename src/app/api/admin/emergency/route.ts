import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { allowRequest } from '@/lib/rateLimit';
import { readJsonWithLimit, newRequestId } from '@/lib/requestGuard';
import { stripControlChars } from '@/lib/textSanitize';
import { securityLog } from '@/lib/securityLogger';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    securityLog.authzFailure('admin_emergency_killswitch_unauthorized');
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  if (!allowRequest(`admin_emergency:${auth.user.id}`, 30, 60_000)) {
    securityLog.rateLimit('admin_emergency_rate_limit', `admin_emergency:${auth.user.id}`, undefined, 30, 60_000);
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = await readJsonWithLimit(request, 8 * 1024);
  if (!body.ok) return body.response;
  const parsed = z
    .object({
      paused: z.boolean(),
      // Audit-log bound: strip control/bidi chars before validation.
      reason: z.string().transform(stripControlChars).pipe(z.string().trim().min(3).max(500)),
    })
    .safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Apply the state change FIRST so the audit log can never claim an action
  // that did not happen (SEC-005). Single-row upsert; updated_by records actor.
  const { error: stateError } = await supabaseAdmin.from('system_state').upsert({
    id: 'global',
    purchases_paused: parsed.data.paused,
    updated_by: auth.user.id,
  });
  if (stateError) {
    const requestId = newRequestId();
    console.error('emergency pause state update failed:', requestId, stateError.message);
    return NextResponse.json({ error: 'Unable to change purchase state', request_id: requestId }, { status: 500 });
  }

  const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
    admin_user_id: auth.user.id,
    admin_identifier: auth.user.id,
    action: parsed.data.paused ? 'purchases_paused' : 'purchases_resumed',
    target_type: 'system',
    target_id: 'global',
    reason: parsed.data.reason,
    metadata: { purchases_paused: parsed.data.paused },
  });
  if (auditError) {
    // The action is already applied; surface the audit gap loudly server-side.
    console.error('admin audit insert failed:', auditError.message);
  }

  securityLog.killswitchChange(auth.user.id, parsed.data.paused, parsed.data.reason);
  securityLog.adminAction(
    parsed.data.paused ? 'purchases_paused' : 'purchases_resumed',
    auth.user.id,
    'global',
    { reason: parsed.data.reason }
  );

  return NextResponse.json({ success: true, purchases_paused: parsed.data.paused });
}
