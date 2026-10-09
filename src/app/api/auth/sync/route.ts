import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensurePublicUser } from '@/lib/userSync';
import { allowRequest } from '@/lib/rateLimit';
import { newRequestId } from '@/lib/requestGuard';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Session-scoped budget: sync provisions a public user row (SEC-007).
    if (!allowRequest(`auth_sync:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
    }

    const publicUser = await ensurePublicUser(user);
    return NextResponse.json({ user: publicUser }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    // SEC-019: never echo internal error details to the client
    const requestId = newRequestId();
    console.error('Auth sync failed:', requestId, err);
    return NextResponse.json({ error: 'Sync failed', request_id: requestId }, { status: 500 });
  }
}
