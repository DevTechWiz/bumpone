import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';
import { allowRequest } from '@/lib/rateLimit';
import { clientIp, readJsonWithLimit, PRIVATE_NO_STORE, newRequestId } from '@/lib/requestGuard';
import { ReportSchema } from '@/lib/contentSchemas';

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: NextRequest) {
  try {
    // SEC-021: CF-Connecting-IP is edge-set and cannot be forged by the client.
    const ip = clientIp(request);
    if (!allowRequest(`report:${ip}`, 5, 60 * 60_000)) {
      return NextResponse.json({ error: 'Too many reports' }, { status: 429, headers: { 'Retry-After': '3600' } });
    }

    const body = await readJsonWithLimit(request, MAX_BODY_BYTES);
    if (!body.ok) return body.response;

    const result = ReportSchema.safeParse(body.value);

    if (!result.success) {
      // Field names only — never echo schema internals/stack details (Phase 3).
      const fields = result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean);
      return NextResponse.json(
        { error: 'Invalid report data', fields: [...new Set(fields)] },
        { status: 400, headers: PRIVATE_NO_STORE }
      );
    }

    const { projectId, profileId, reason, details } = result.data;
    const targetId = (projectId || profileId)!;
    // reports.project_id is uuid: reject malformed ids before they reach Postgres (400, not 500)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    // SEC-021: the reporter fingerprint salt must be a real secret in production.
    // Fail closed (503) instead of silently degrading to the 'development' salt,
    // which would let anyone compute another IP's fingerprint.
    const secret = process.env.ANON_COOKIE_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('ANON_COOKIE_SECRET is not set — report submission disabled (SEC-021)');
        return NextResponse.json({ error: 'Reports are temporarily unavailable' }, { status: 503 });
      }
      console.warn('ANON_COOKIE_SECRET unset — using development salt for report fingerprints');
    }
    const reporterId = crypto.createHash('sha256').update(`${secret || 'development'}:${ip}`).digest('hex');

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      const { error: err1 } = await supabaseAdmin.from('reports').insert({
        project_id: targetId,
        reporter_id: reporterId,
        reason,
        details: details || null,
        status: 'open',
      });

      if (err1) {
        const requestId = newRequestId();
        console.error('Error inserting report:', requestId, err1);
        return NextResponse.json({ error: 'Failed to record report', request_id: requestId }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully. Our moderation team will review this slot.',
    });
  } catch (err: any) {
    const requestId = newRequestId();
    console.error('Report submission error:', requestId, err);
    return NextResponse.json({ error: 'Internal server error', request_id: requestId }, { status: 500 });
  }
}
