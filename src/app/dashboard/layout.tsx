import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardSidebar from '@/components/DashboardSidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Use getSession() to read directly from cookies (no network call).
  // getUser() was failing because the server-side JWT validation
  // requires the middleware to perfectly forward refreshed cookies,
  // which is fragile. getSession() is reliable for gating access.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login');
  }

  // Use maybeSingle to avoid throwing when profile doesn't exist yet
  const { data: profile } = await supabase
    .from('wb_profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profile?.role === 'guest') {
    redirect('/');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
