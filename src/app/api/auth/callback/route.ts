import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase auth callback handler.
 *
 * This route is the canonical server-side callback that uses @supabase/ssr
 * to properly exchange the auth code for a session and set HTTP-only cookies.
 *
 * It handles all Supabase auth redirects:
 * - Email confirmation (type=signup, type=email)
 * - OAuth provider callbacks (Google, GitHub, etc.)
 * - Magic link sign-ins (type=magiclink)
 * - Password recovery (type=recovery)
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/dashboard';
  const type = requestUrl.searchParams.get('type');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle error redirects from OAuth providers
  if (errorParam) {
    console.error('Auth callback error:', errorParam, errorDescription);
    const loginUrl = new URL('/auth/login', requestUrl.origin);
    loginUrl.searchParams.set(
      'error',
      errorDescription || 'Authentication failed. Please try again.'
    );
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login', requestUrl.origin));
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) => {
              cookieStore.set(name, value, options as any);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', error.message);
      const loginUrl = new URL('/auth/login', requestUrl.origin);
      loginUrl.searchParams.set(
        'error',
        'Failed to verify your account. The link may have expired.'
      );
      return NextResponse.redirect(loginUrl);
    }

    // Route based on callback type
    if (type === 'recovery') {
      return NextResponse.redirect(
        new URL('/auth/reset-password', requestUrl.origin)
      );
    }

    if (type === 'signup' || type === 'email') {
      // Email confirmed — check if the user has a profile to determine role
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('wb_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.role === 'owner') {
          return NextResponse.redirect(
            new URL('/dashboard', requestUrl.origin)
          );
        }
      }
    }

    // Default: redirect to the `next` parameter or dashboard
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  } catch (err) {
    console.error('Auth callback unexpected error:', err);
    return NextResponse.redirect(
      new URL(
        '/auth/login?error=Something+went+wrong.+Please+try+again.',
        requestUrl.origin
      )
    );
  }
}
