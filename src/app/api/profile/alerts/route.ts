import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readJsonWithLimit } from '@/lib/requestGuard';
import { allowRequest } from '@/lib/rateLimit';

const AlertPreferencesSchema = z.object({
  emailAlerts: z.boolean().default(true),
  browserAlerts: z.boolean().default(false),
  instantKingAlert: z.boolean().default(true),
});

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('alert_preferences')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({
        preferences: { emailAlerts: true, browserAlerts: false, instantKingAlert: true },
      });
    }

    const preferences = data?.alert_preferences || {
      emailAlerts: true,
      browserAlerts: false,
      instantKingAlert: true,
    };

    return NextResponse.json({ preferences });
  } catch (_err) {
    return NextResponse.json({
      preferences: { emailAlerts: true, browserAlerts: false, instantKingAlert: true },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!allowRequest(`alert_prefs:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await readJsonWithLimit(request, 10_000);
    if (!body.ok) return body.response;

    const parsed = AlertPreferencesSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid preferences' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ alert_preferences: parsed.data })
      .eq('id', user.id);

    if (updateError) {
      // If column is missing in a preview env, don't 500
      console.warn('Failed to save alert_preferences to database:', updateError.message);
    }

    return NextResponse.json({ success: true, preferences: parsed.data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update preferences' }, { status: 500 });
  }
}
