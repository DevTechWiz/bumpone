import { createServerSupabaseClient } from '@/lib/supabase/server';

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

  return { error: 'Forbidden' as const };
}
