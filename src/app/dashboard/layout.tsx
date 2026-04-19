import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardSidebar from '@/components/DashboardSidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Try getUser first (validates with Supabase server)
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user) {
    console.error('Dashboard: No user found', userError?.message);
    redirect('/auth/login');
  }

  // Use maybeSingle to avoid throwing when profile doesn't exist yet
  const { data: profile } = await supabase
    .from('wb_profiles')
    .select('role')
    .eq('id', user.id)
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
