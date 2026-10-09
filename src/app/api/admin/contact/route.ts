import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  let query = supabaseAdmin
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && ['new', 'in_progress', 'resolved'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

const UpdateStatusSchema = z
  .object({
    messageId: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
    status: z.enum(['new', 'in_progress', 'resolved']).optional(),
    adminNotes: z.string().max(4000).optional(),
    admin_notes: z.string().max(4000).optional(),
  })
  .refine((d) => Boolean(d.messageId || d.id), { message: 'Message ID is required' });

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update payload' }, { status: 400 });
  }

  const targetId = parsed.data.messageId || parsed.data.id;
  const adminNotes = parsed.data.adminNotes ?? parsed.data.admin_notes;

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (adminNotes !== undefined) updates.admin_notes = adminNotes;

  const { data, error } = await supabaseAdmin
    .from('contact_messages')
    .update(updates)
    .eq('id', targetId!)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: data });
}
