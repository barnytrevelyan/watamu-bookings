import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

/**
 * Reconstruct the Supabase access token from one or more sb-*-auth-token
 * cookies. @supabase/ssr 0.3 stores it either as a single JSON cookie, a
 * base64-prefixed JSON cookie, or split across `.0` / `.1` chunks. We try
 * all three shapes and return the first one that parses into a usable
 * { access_token } object.
 */
export function extractAccessTokenFromCookies(req: NextRequest): string | null {
  const all = req.cookies.getAll();
  const sbCookies = all.filter((c) =>
    /^sb-.*-auth-token(\.\d+)?$/.test(c.name)
  );
  if (sbCookies.length === 0) return null;

  // Group cookies by their base name so chunked cookies reassemble in order.
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

export interface ResolvedUser {
  user: User;
  accessToken: string;
  authPath: 'ssr' | 'manual-jwt';
}

/**
 * Resolve the current user for an import route. Tries getSession() first, then
 * falls back to manually extracting the access token from cookies and
 * validating it via a plain Supabase client — this side-steps a cookie
 * encoding mismatch we see in @supabase/ssr 0.3 on Vercel.
 */
export async function resolveImportUser(
  request: NextRequest
): Promise<{ ok: true; result: ResolvedUser } | { ok: false; response: NextResponse }> {
  const supabase = await createServerClient();

  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();

  let user: User | null = session?.user ?? null;
  let accessToken: string | null = session?.access_token ?? null;
  let authPath: 'ssr' | 'manual-jwt' = 'ssr';

  if (!user) {
    const token = extractAccessTokenFromCookies(request);
    if (token) {
      const admin = createPlainClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: userData } = await admin.auth.getUser(token);
      if (userData?.user) {
        user = userData.user;
        accessToken = token;
        authPath = 'manual-jwt';
      }
    }
  }

  const sbCookieCount = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith('sb-')).length;

  if (!user || !accessToken) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            sbCookieCount === 0
              ? 'No auth cookies reached the server. Try a hard refresh (Cmd+Shift+R), or sign out and back in.'
              : 'Your session has expired. Please sign out, sign back in, and try again.',
          debug: {
            sbCookieCount,
            sessionErr: sessionErr?.message ?? null,
          },
        },
        { status: 401 }
      ),
    };
  }

  return { ok: true, result: { user, accessToken, authPath } };
}
