import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware that handles:
 * 1. Supabase auth session refresh (critical for sign-in to work)
 * 2. Subdomain routing for watamu.ke
 *
 * The auth session refresh MUST happen in middleware so that
 * server components and route handlers see a valid session
 * after the user signs in on the client side.
 */

// Subdomains that should never be treated as listing slugs
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'dashboard',
  'mail',
  'smtp',
  'staging',
  'dev',
  'preview',
]);

// Root domains we support subdomains on
const SUBDOMAIN_HOSTS = ['watamu.ke'];

export async function middleware(request: NextRequest) {
  // --- 1. Refresh the Supabase auth session ---
  // This is essential: without it, server components won't see
  // the user's session after login. The middleware refreshes
  // expired tokens and re-sets the cookies on every request.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          // Set cookies on the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          // Create a new response that carries the updated cookies
          supabaseResponse = NextResponse.next({ request });
          // Set cookies on the response (for the browser)
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT remove this getUser() call.
  // It triggers the session refresh and cookie update.
  // Without it, the middleware does nothing useful.
  await supabase.auth.getUser();

  // --- 2. Subdomain routing for watamu.ke ---
  const { hostname, pathname } = request.nextUrl;

  const rootDomain = SUBDOMAIN_HOSTS.find((domain) =>
    hostname.endsWith(domain)
  );

  if (rootDomain) {
    // Extract subdomain: "unreel.watamu.ke" -> "unreel"
    const sub = hostname.replace(`.${rootDomain}`, '');

    // Only process if there's a real, non-reserved subdomain
    if (sub && sub !== rootDomain && !RESERVED_SUBDOMAINS.has(sub)) {
      // Don't rewrite API routes, static files, or Next.js internals
      if (
        !pathname.startsWith('/api/') &&
        !pathname.startsWith('/_next/') &&
        !pathname.startsWith('/auth/') &&
        !pathname.includes('.') // Static files like favicon.ico
      ) {
        if (pathname === '/' || pathname === '') {
          // Root of subdomain -> rewrite to subdomain resolver
          const url = request.nextUrl.clone();
          url.pathname = `/s/${sub}`;
          const response = NextResponse.rewrite(url);

          // Copy over the auth cookies from supabaseResponse
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            response.cookies.set(cookie.name, cookie.value);
          });

          response.headers.set('x-subdomain-slug', sub);
          response.headers.set('x-subdomain-host', hostname);
          return response;
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
