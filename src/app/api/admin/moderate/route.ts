import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { allowRequest } from '@/lib/rateLimit';
import { readJsonWithLimit, newRequestId } from '@/lib/requestGuard';
import { stripControlChars } from '@/lib/textSanitize';
import { securityLog } from '@/lib/securityLogger';

const schema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(['approved', 'suspended', 'rejected', 'pending']),
  // Reasons land in the immutable audit log — strip control/bidi chars so log
  // viewers can never be fed terminal escapes or invisible text.
  reason: z.string().transform(stripControlChars).pipe(z.string().trim().min(3).max(500)),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    securityLog.authzFailure('admin_moderate_unauthorized');
    return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthenticated' ? 401 : 403 });
  }

  if (!allowRequest(`admin_moderate:${auth.user.id}`, 60, 60_000)) {
    securityLog.rateLimit('admin_moderate_rate_limit', `admin_moderate:${auth.user.id}`, undefined, 60, 60_000);
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = await readJsonWithLimit(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = schema.safeParse(body.value);
  if (!input.success) return NextResponse.json({ error: 'Invalid moderation parameters' }, { status: 400 });

  const { data: updated, error } = await supabaseAdmin
    .from('projects')
    .update({ moderation_status: input.data.status, is_active: input.data.status === 'approved' })
    .eq('id', input.data.projectId)
    .select('id');
  if (error) {
    const requestId = newRequestId();
    console.error('Project moderation update failed:', requestId, error.message);
    return NextResponse.json({ error: 'Unable to update project', request_id: requestId }, { status: 500 });
  }
  // No rows updated = unknown project id. Fail before ranks/audit so the log
  // never records an action against a project that does not exist.
  if (!updated?.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  await supabaseAdmin.rpc('recalculate_board_ranks');
  const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
    admin_user_id: auth.user.id,
    admin_identifier: auth.user.id,
    action: `project_${input.data.status}`,
    target_type: 'project',
    target_id: input.data.projectId,
    reason: input.data.reason,
    metadata: { moderation_status: input.data.status },
  });
  if (auditError) console.error('admin audit insert failed:', auditError.message);

  securityLog.moderationAction(
    `admin_moderate_${input.data.status}`,
    auth.user.id,
    input.data.projectId,
    input.data.status,
    input.data.reason
  );
  securityLog.adminAction(
    `project_${input.data.status}`,
    auth.user.id,
    input.data.projectId,
    { reason: input.data.reason }
  );

  return NextResponse.json({ success: true });
}
