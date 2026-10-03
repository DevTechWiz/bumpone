import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthenticated' as const };

  // 1. Check admin_users table in Supabase
  const { data: membership } = await supabaseAdmin
    .from('admin_users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (membership) {
    return { user, role: membership.role };
  }

  // 2. Check Supabase Auth app_metadata
  if (user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'super_admin') {
    return { user, role: user.app_metadata.role as string };
  }

  return { error: 'Forbidden' as const };
}
