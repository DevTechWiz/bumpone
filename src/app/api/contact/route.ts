import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { allowRequest } from '@/lib/rateLimit';
import { clientIp, readJsonWithLimit, PRIVATE_NO_STORE } from '@/lib/requestGuard';
import { sanitizePlainText } from '@/lib/textSanitize';
import { sendContactNotification } from '@/lib/resend';

const MAX_BODY_BYTES = 32 * 1024;

const ContactInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  email: z.string().trim().email('Valid email is required').max(255, 'Email is too long'),
  subject: z.string().trim().min(1, 'Subject is required').max(200, 'Subject must be 200 characters or less'),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(4000, 'Message is too long'),
  _hp: z.string().optional(), // Honeypot field for bot suppression
});

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);

    // Rate limit: 5 contact messages per IP per hour
    if (!allowRequest(`contact:${ip}`, 5, 60 * 60_000)) {
      return NextResponse.json(
        { error: 'Too many messages submitted. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600', ...PRIVATE_NO_STORE } }
      );
    }

    const bodyResult = await readJsonWithLimit(request, MAX_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const parsed = ContactInputSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Invalid form input';
      return NextResponse.json({ error: firstError }, { status: 400, headers: PRIVATE_NO_STORE });
    }

    const { name, email, subject, message, _hp } = parsed.data;

    // Honeypot check: Bots filling hidden field are silently ignored
    if (_hp && _hp.trim().length > 0) {
      return NextResponse.json({ success: true, message: 'Message sent successfully' });
    }

    const cleanName = sanitizePlainText(name, 100);
    const cleanSubject = sanitizePlainText(subject, 200);
    const cleanMessage = sanitizePlainText(message, 4000);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const { data, error } = await supabaseAdmin
      .from('contact_messages')
      .insert({
        name: cleanName,
        email: email.toLowerCase(),
        subject: cleanSubject,
        message: cleanMessage,
        status: 'new',
        ip_address: ip,
        user_agent: userAgent.slice(0, 500),
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Failed to store contact message:', error.message);
      return NextResponse.json(
        { error: 'Unable to submit message at this time. Please email support@bumpone.lol directly.' },
        { status: 500, headers: PRIVATE_NO_STORE }
      );
    }

    // Dispatch background alert if Resend is enabled
    sendContactNotification({
      name: cleanName,
      email: email.toLowerCase(),
      subject: cleanSubject,
      message: cleanMessage,
      messageId: data.id,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      id: data.id,
      message: 'Message sent successfully. Our team will get back to you within 24 hours.',
    });
  } catch (err: any) {
    console.error('Contact submission error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE }
    );
  }
}
