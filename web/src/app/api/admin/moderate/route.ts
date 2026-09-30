import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; import { supabaseAdmin } from '@/lib/supabase/admin'; import { requireAdmin } from '@/lib/adminAuth';
const schema = z.object({ projectId: z.string().uuid(), status: z.enum(['approved', 'suspended', 'rejected']), reason: z.string().trim().min(3).max(500) });
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthenticated' ? 401 : 403 });
  const input = schema.safeParse(await request.json()); if (!input.success) return NextResponse.json({ error: 'Invalid moderation parameters' }, { status: 400 });
  const { error } = await supabaseAdmin.from('projects').update({ moderation_status: input.data.status, is_active: input.data.status === 'approved' }).eq('id', input.data.projectId); if (error) return NextResponse.json({ error: 'Unable to update project' }, { status: 500 });
  await supabaseAdmin.rpc('recalculate_board_ranks');
  await supabaseAdmin.from('admin_audit_log').insert({ admin_user_id: auth.user.id, admin_identifier: auth.user.id, action: `project_${input.data.status}`, target_type: 'project', target_id: input.data.projectId, reason: input.data.reason });
  return NextResponse.json({ success: true });
}
