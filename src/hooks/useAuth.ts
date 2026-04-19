'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';

export function useAuth() {
  // useMemo ensures we get the same client instance across re-renders
  // but only creates it in the browser (not during SSR)
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // 1. Read the session from cookies — fast, no network call
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted.current) return;

      if (session?.user) {
        setUser(session.user);
        setLoading(false); // Unblock UI immediately

        // 2. Fetch profile in background — non-blocking
        supabase
          .from('wb_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (mounted.current && data) {
              setProfile(data as Profile);
            }
          });
      } else {
        setLoading(false);
      }
    });

    // 3. Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;

      if (session?.user) {
        setUser(session.user);
        setLoading(false);

        // Refresh profile on auth change
        supabase
          .from('wb_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (mounted.current) {
              setProfile(data ? (data as Profile) : null);
            }
          });
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Derive role from profile first, fall back to JWT user_metadata
  const role = profile?.role || (user?.user_metadata?.role as string | undefined);

  return {
    user,
    profile,
    loading,
    isAdmin: role === 'admin',
    isOwner: role === 'owner',
    isGuest: role === 'guest',
    signOut: async () => {
      await supabase.auth.signOut().catch(() => {});
    },
  };
}
