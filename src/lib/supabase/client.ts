import { createBrowserClient } from '@supabase/ssr';

// Singleton browser client. Creating a fresh client on every call means each
// one runs its own token-refresh timer; when two of them race on the same
// rotating refresh token, the loser gets a SIGNED_OUT event that bounces the
// user to /auth/login (seen in the wild on /dashboard/flexi-pricing, which
// fans out multiple clients on mount). One client, one refresh timer, no race.
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (typeof window === 'undefined') {
    // Safety net for any accidental SSR call — each server render gets its own
    // client rather than leaking a singleton across requests. In practice
    // this module is client-only.
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return browserClient;
}
