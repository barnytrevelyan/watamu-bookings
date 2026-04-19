'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardSidebar from '@/components/DashboardSidebar';

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, isGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
    if (!loading && user && isGuest) {
      router.replace('/');
    }
  }, [loading, user, isGuest, router]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Not authenticated or guest — redirect is happening via useEffect
  if (!user || isGuest) {
    return null;
  }

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
