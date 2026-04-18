import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase auth callback handler.
 *
 * This route handles:
 * - Email confirmation links (type=signup or type=email)
 * - OAuth provider callbacks
 * - Magic link sign-ins
 * - Password recovery links
 *
 * Supabase redirects here with a `code` query parameter that we exchange
 * for a session using the server-side Supabase client.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/dashboard';
  const type = requestUrl.searchParams.get('type');

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth callback exchange error:', error);
        return NextResponse.redirect(
          new URL(
            `/auth/login?error=${encodeURIComponent('Failed to verify your account. Please try again.')}`,
            requestUrl.origin
          )
        );
      }

      // If this is a password recovery callback, redirect to reset password page
      if (type === 'recovery') {
        return NextResponse.redirect(
          new URL('/auth/reset-password', requestUrl.origin)
        );
      }

      // Redirect to the intended destination
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    } catch (err) {
      console.error('Auth callback error:', err);
      return NextResponse.redirect(
        new URL('/auth/login?error=Something+went+wrong', requestUrl.origin)
      );
    }
  }

  // No code provided — redirect to login
  return NextResponse.redirect(new URL('/auth/login', requestUrl.origin));
}
