'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import DashboardSidebar from '@/components/DashboardSidebar';

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    // Only redirect once we know for sure there's no user
    if (!loading && !user) {
      window.location.href = '/auth/login';
    }
  }, [loading, user]);

  // Still checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not logged in — redirect is happening via useEffect
  if (!user) {
    return null;
  }

  // User is authenticated — show dashboard immediately.
  // Use JWT metadata for name (instant), profile name as upgrade when it loads.
  const userName =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'User';
  const userEmail = user.email || '';

  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar userName={userName} userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
