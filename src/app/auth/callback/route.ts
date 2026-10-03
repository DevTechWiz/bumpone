import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensurePublicUser } from '@/lib/userSync';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNext = searchParams.get('next') || '/';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data?.session?.user) {
        // Create entry in public.users if first time authenticating
        await ensurePublicUser(data.session.user);
        return NextResponse.redirect(`${origin}${next}`);
      }
      if (error) {
        console.error('Auth code exchange error:', error);
      }
    } catch (err) {
      console.error('Auth callback failure:', err);
    }
  }

  // Fallback redirect with error indicator
  return NextResponse.redirect(`${origin}${next}?auth_error=1`);
}
