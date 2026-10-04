import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthenticated' as const };

  // 1. Check direct ADMIN_EMAILS environment variable (Fastest, zero DB queries)
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return { user, role: 'super_admin' };
  }

  // 2. Check Supabase Auth app_metadata
  if (user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'super_admin') {
    return { user, role: user.app_metadata.role as string };
  }

  // 3. Fallback to admin_users table if still present
  try {
    const { data: membership } = await supabaseAdmin
      .from('admin_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (membership) {
      return { user, role: membership.role };
    }
  } catch {
    // admin_users table dropped or unavailable
  }

  return { error: 'Forbidden' as const };
}
