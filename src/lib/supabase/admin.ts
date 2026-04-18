import { createClient as _createClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client using the service role key.
 * Use this only in trusted server contexts such as webhook handlers,
 * cron jobs, or background tasks. Never expose the service role key
 * to the browser.
 */
export function createClient() {
  return _createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
