import { supabaseAdmin } from './supabase/admin';
import type { User as AuthUser } from '@supabase/supabase-js';

export async function ensurePublicUser(user: AuthUser) {
  try {
    // 1. Check if user already exists in public.users
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, handle, display_name, avatar_url, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (existingUser) {
      return existingUser;
    }

    // 2. Extract provider details from user_metadata (Google or Twitter)
    const meta = user.user_metadata || {};
    const displayName =
      meta.full_name ||
      meta.name ||
      meta.user_name ||
      meta.preferred_username ||
      user.email?.split('@')[0] ||
      'Creator';

    const rawHandle =
      meta.user_name ||
      meta.preferred_username ||
      meta.full_name?.replace(/\s+/g, '_') ||
      meta.name?.replace(/\s+/g, '_') ||
      user.email?.split('@')[0] ||
      'creator';

    let baseHandle = rawHandle.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!baseHandle || baseHandle.length < 2) {
      baseHandle = 'creator';
    }

    // 3. Ensure handle uniqueness
    let handle = baseHandle;
    let counter = 1;
    while (true) {
      const { data: handleExists } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('handle', handle)
        .maybeSingle();

      if (!handleExists) break;
      handle = `${baseHandle}${counter++}`;
    }

    const avatarUrl = meta.avatar_url || meta.picture || null;
    const twitterHandle = meta.user_name ? String(meta.user_name).replace('@', '') : null;

    // 4. Insert required user profile fields into public.users
    const { data: newUser, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        handle,
        display_name: displayName,
        avatar_url: avatarUrl,
        twitter: twitterHandle,
        created_at: user.created_at || new Date().toISOString(),
      })
      .select('id, handle, display_name, avatar_url, created_at')
      .single();

    if (error) {
      console.error('Failed to create public.users entry:', error);
      return null;
    }

    return newUser;
  } catch (err) {
    console.error('ensurePublicUser error:', err);
    return null;
  }
}
