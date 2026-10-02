'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from './supabase/client';

export interface PublicUserProfile {
  id: string;
  handle: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  website?: string;
  twitter?: string;
  github?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const supabase = createClient();
      const res = await supabase
        .from('users')
        .select('id, handle, display_name, avatar_url, bio, website, twitter, github')
        .eq('id', userId)
        .maybeSingle();

      if (res.data?.handle) {
        setProfile(res.data as PublicUserProfile);
        return res.data as PublicUserProfile;
      }

      // If user profile is not in public.users yet, trigger sync endpoint
      const syncRes = await fetch('/api/auth/sync', { method: 'POST' });
      if (syncRes.ok) {
        const synced = await syncRes.json();
        if (synced?.user?.handle) {
          setProfile(synced.user as PublicUserProfile);
          return synced.user as PublicUserProfile;
        }
      }
    } catch (e) {
      console.warn('Failed to load profile in useAuth:', e);
    }
    return null;
  }, []);

  useEffect(() => {
    try {
      const supabase = createClient();

      // Check current session
      supabase.auth.getUser().then(({ data, error }) => {
        if (!error && data?.user) {
          setUser(data.user);
          fetchProfile(data.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });

      // Listen for auth events (sign in, sign out, token refresh)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          fetchProfile(currentUser.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch {
      setLoading(false);
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      return await fetchProfile(user.id);
    }
    return null;
  }, [user?.id, fetchProfile]);

  return { user, profile, loading, signOut, refreshProfile };
}
