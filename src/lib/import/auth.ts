import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createPlainClient } from '@supabase/supabase-js';

/**
 * Shared auth resolver for the /api/import/* routes.
 *
 * In production we've seen @supabase/ssr@0.3 fail to decode the sb-*-auth-token
 * cookie inside a route handler even though the browser client wrote it
 * cleanly — usually because the cookie is chunked across `.0` / `.1` suffixes
 * or wrapped with a `base64-` prefix that the SSR decoder's version doesn't
 * understand. The symptom is a 401 "Authentication required" on /dashboard/import
 * even when the user is clearly logged in.
 *
 * This helper:
 *   1. Tries the SSR client first (normal path).
 *   2. Falls back to reading the cookie ourselves, reconstructing any chunks,
 *      unwrapping base64- prefixes, and validating the extracted JWT via a
 *      plain supabase-js admin client.
 *
 * Returns { user, authPath } where authPath is 'ssr' or 'manual-jwt' (useful
 * for log lines). Returns null if neither path yields a user.
 */

function extractAccessTokenFromCookies(req: NextRequest): string | null {
  const all = req.cookies.getAll();
  const sbCookies = all.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  if (sbCookies.length === 0) return null;

  // Group cookies by base name so chunked cookies reassemble in index order.
  const groups = new Map<string, { index: number; value: string }[]>();
  for (const c of sbCookies) {
    const m = c.name.match(/^(sb-.*-auth-token)(?:\.(\d+))?$/);
    if (!m) continue;
    const base = m[1];
    const idx = m[2] ? parseInt(m[2], 10) : 0;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push({ index: idx, value: c.value });
  }

  for (const parts of Array.from(groups.values())) {
    parts.sort((a, b) => a.index - b.index);
    let raw = parts.map((p) => p.value).join('');
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* ignore */
    }
    if (raw.startsWith('base64-')) {
      try {
        raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf-8');
      } catch {
        continue;
      }
    }
    try {
      const parsed = JSON.parse(raw);
      const token =
        parsed?.access_token ||
        parsed?.currentSession?.access_token ||
        (Array.isArray(parsed) ? parsed[0] : null);
      if (typeof token === 'string' && token.length > 20) return token;
    } catch {
      if (/^eyJ/.test(raw)) return raw;
    }
  }
  return null;
}

export interface ResolvedImportAuth {
  user: User;
  authPath: 'ssr' | 'manual-jwt';
}

export async function resolveImportUser(
  request: NextRequest
): Promise<ResolvedImportAuth | null> {
  const supabase = await createServerClient();
  const {
    data: { user: ssrUser },
  } = await supabase.auth.getUser();
  if (ssrUser) {
    return { user: ssrUser, authPath: 'ssr' };
  }

  const accessToken = extractAccessTokenFromCookies(request);
  if (!accessToken) return null;

  const admin = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: userData } = await admin.auth.getUser(accessToken);
  if (userData?.user) {
    return { user: userData.user, authPath: 'manual-jwt' };
  }
  return null;
}
