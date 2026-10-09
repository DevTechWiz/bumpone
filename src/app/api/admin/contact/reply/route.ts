import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { z } from 'zod';
import { sendContactReply } from '@/lib/resend';
import { sanitizePlainText } from '@/lib/textSanitize';

const ReplySchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
  replyText: z.string().trim().min(1, 'Reply message cannot be empty').max(4000, 'Reply is too long'),
  markStatus: z.enum(['new', 'in_progress', 'resolved']).default('resolved'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === 'Unauthenticated' ? 401 : 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid reply data' },
      { status: 400 }
    );
  }

  const { messageId, replyText, markStatus } = parsed.data;

  // 1. Fetch the original message
  const { data: ticket, error: fetchErr } = await supabaseAdmin
    .from('contact_messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const cleanReply = sanitizePlainText(replyText, 4000);

  // 2. Dispatch via Resend
  const emailRes = await sendContactReply({
    to: ticket.email,
    subject: ticket.subject,
    replyText: cleanReply,
    originalMessage: ticket.message,
    originalSenderName: ticket.name,
  });

  // 3. Record in database thread
  const existingReplies = Array.isArray(ticket.replies) ? ticket.replies : [];
  const replyRecord = {
    id: crypto.randomUUID(),
    admin_email: auth.user.email || 'support@bumpone.lol',
    reply_text: cleanReply,
    resend_id: emailRes.id || null,
    delivered_via_api: emailRes.success,
    error: emailRes.error || null,
    sent_at: new Date().toISOString(),
  };

  const updatedReplies = [...existingReplies, replyRecord];

  const { data: updatedTicket, error: updateErr } = await supabaseAdmin
    .from('contact_messages')
    .update({
      replies: updatedReplies,
      status: markStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('Failed to update ticket replies:', updateErr.message);
  }

  return NextResponse.json({
    success: true,
    emailDispatched: emailRes.success,
    resendError: emailRes.error || null,
    ticket: updatedTicket || { ...ticket, replies: updatedReplies, status: markStatus },
  });
}
