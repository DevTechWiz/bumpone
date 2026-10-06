import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { allowRequest } from '@/lib/rateLimit';
import { clientIp, PRIVATE_NO_STORE } from '@/lib/requestGuard';

export async function GET(request: NextRequest) {
  // Per-IP budget before any DB lookup: handle enumeration is a DB read per hit (SEC-007).
  if (!allowRequest(`check_handle:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json(
      { available: false, error: 'Too many requests' },
      { status: 429, headers: { ...PRIVATE_NO_STORE, 'Retry-After': '60' } }
    );
  }

  // userId makes the answer caller-specific (own handle reads as available):
  // every response is therefore private, no-store (cache-security, Phase 3).
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: PRIVATE_NO_STORE });

  const { searchParams } = new URL(request.url);
  const rawHandle = searchParams.get('handle') || '';
  const userId = searchParams.get('userId') || '';

  const cleanHandle = rawHandle.replace(/^@/, '').trim().toLowerCase();

  // Validate format: 2-30 characters, alphanumeric and underscore only
  if (!cleanHandle || cleanHandle.length < 2) {
    return json({ available: false, error: 'Handle must be at least 2 characters long.' }, 400);
  }

  if (cleanHandle.length > 30) {
    return json({ available: false, error: 'Handle cannot exceed 30 characters.' }, 400);
  }

  if (!/^[a-z0-9_]+$/.test(cleanHandle)) {
    return json({ available: false, error: 'Handle can only contain letters, numbers, and underscores.' }, 400);
  }

  // userId feeds a PostgREST uuid filter: malformed values must 400, not 500
  if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ available: false, error: 'Invalid user id' }, 400);
  }

  try {
    let query = supabaseAdmin
      .from('users')
      .select('id')
      .ilike('handle', cleanHandle);

    if (userId) {
      query = query.neq('id', userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error checking handle availability:', error);
      return json({ available: false, error: 'Database check failed' }, 500);
    }

    if (data) {
      return json({ available: false, error: 'This @handle is already taken.' });
    }

    return json({ available: true, handle: cleanHandle });
  } catch (err: any) {
    console.error('Check handle failure:', err);
    return json({ available: false, error: 'Internal server error' }, 500);
  }
}
