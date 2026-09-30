import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ReportSchema = z.object({
  projectId: z.string().optional(),
  profileId: z.string().optional(),
  reason: z.enum(['scam', 'spam', 'offensive', 'broken_link', 'other']),
  details: z.string().min(10, 'A comment with at least 10 characters is required for review').max(500),
}).refine(data => Boolean(data.projectId || data.profileId), {
  message: 'Either projectId or profileId is required',
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const result = ReportSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid report data', details: result.error.format() }, { status: 400 });
    }

    const { projectId, profileId, reason, details } = result.data;
    const targetId = (projectId || profileId)!;
    const reporterId = request.cookies.get('bumped_anon_id')?.value || 'anon_reporter';

    const isSupabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
    );

    if (isSupabaseConfigured) {
      // 1. Try project_id column (clean schema)
      const { error: err1 } = await supabaseAdmin.from('reports').insert({
        project_id: targetId,
        reporter_id: reporterId,
        reason,
        details: details || null,
        status: 'open',
      });

      if (err1) {
        // Fallback to legacy profile_id column
        const { error: err2 } = await supabaseAdmin.from('reports').insert({
          profile_id: targetId,
          reporter_id: reporterId,
          reason,
          details: details || null,
          status: 'open',
        });

        if (err2) {
          console.error('Error inserting report:', err1 || err2);
          return NextResponse.json({ error: 'Failed to record report' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully. Our moderation team will review this slot.',
    });
  } catch (err: any) {
    console.error('Report submission error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
