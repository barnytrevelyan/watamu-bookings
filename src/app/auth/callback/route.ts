import { NextRequest, NextResponse } from 'next/server';

/**
 * Legacy auth callback route — redirects to the canonical /api/auth/callback.
 *
 * The proper auth callback lives at /api/auth/callback which uses @supabase/ssr
 * for correct cookie handling. This route exists only to catch any stale
 * email confirmation links that still point to /auth/callback.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Preserve all query parameters (code, type, next, etc.)
  const redirectUrl = new URL('/api/auth/callback', url.origin);
  redirectUrl.search = url.search;
  return NextResponse.redirect(redirectUrl);
}
