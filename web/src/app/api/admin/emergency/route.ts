import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; import { supabaseAdmin } from '@/lib/supabase/admin'; import { requireAdmin } from '@/lib/adminAuth';
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthenticated' ? 401 : 403 });
  const body = z.object({ paused: z.boolean() }).safeParse(await request.json()); if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { error } = await supabaseAdmin.from('system_state').upsert({ id: 'global', purchases_paused: body.data.paused, updated_by: auth.user.id }); if (error) return NextResponse.json({ error: 'Unable to update system state' }, { status: 500 });
  await supabaseAdmin.from('admin_audit_log').insert({ admin_user_id: auth.user.id, admin_identifier: auth.user.id, action: body.data.paused ? 'purchases_paused' : 'purchases_resumed', target_type: 'system', target_id: 'global' });
  return NextResponse.json({ success: true, purchases_paused: body.data.paused });
}
