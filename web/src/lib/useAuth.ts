'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from './supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const supabase = createClient();

      // Check current session
      supabase.auth.getUser().then(({ data, error }) => {
        if (!error && data?.user) {
          setUser(data.user);
        }
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });

      // Listen for auth events (sign in, sign out, token refresh)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  return { user, loading, signOut };
}
