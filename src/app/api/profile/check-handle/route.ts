import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawHandle = searchParams.get('handle') || '';
  const userId = searchParams.get('userId') || '';

  const cleanHandle = rawHandle.replace(/^@/, '').trim().toLowerCase();

  // Validate format: 2-30 characters, alphanumeric and underscore only
  if (!cleanHandle || cleanHandle.length < 2) {
    return NextResponse.json(
      { available: false, error: 'Handle must be at least 2 characters long.' },
      { status: 400 }
    );
  }

  if (cleanHandle.length > 30) {
    return NextResponse.json(
      { available: false, error: 'Handle cannot exceed 30 characters.' },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9_]+$/.test(cleanHandle)) {
    return NextResponse.json(
      { available: false, error: 'Handle can only contain letters, numbers, and underscores.' },
      { status: 400 }
    );
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
      return NextResponse.json({ available: false, error: 'Database check failed' }, { status: 500 });
    }

    if (data) {
      return NextResponse.json({ available: false, error: 'This @handle is already taken.' });
    }

    return NextResponse.json({ available: true, handle: cleanHandle });
  } catch (err: any) {
    console.error('Check handle failure:', err);
    return NextResponse.json({ available: false, error: 'Internal server error' }, { status: 500 });
  }
}
