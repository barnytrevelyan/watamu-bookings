import DashboardShell from '@/components/DashboardShell';

// Note: auth is gated client-side inside DashboardShell rather than here.
// An earlier iteration did a server-side getUser() check, but that introduces
// a race after signInWithPassword + window.location.href='/dashboard' — the
// Supabase session cookie hasn't finished propagating by the time the RSC
// layout runs, so getUser() returns null and the user bounces back to login.
// Keeping the client gate in DashboardShell is sufficient and predictable.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
