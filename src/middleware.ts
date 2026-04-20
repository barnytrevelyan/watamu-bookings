import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware that handles:
 * 1. Supabase auth session refresh (keeps cookies fresh)
 * 2. Subdomain routing for watamu.ke
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
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Refresh the session. getUser() is authoritative (validates JWT with
  // Supabase servers) but adds latency. getSession() just reads cookies
  // and refreshes locally if expired — much faster and sufficient here
  // since the client-side handles the real auth gating.
  await supabase.auth.getSession();

  // --- 2. Subdomain routing for watamu.ke ---
  const { hostname, pathname } = request.nextUrl;

  const rootDomain = SUBDOMAIN_HOSTS.find((domain) =>
    hostname.endsWith(domain)
  );

  if (rootDomain) {
    const sub = hostname.replace(`.${rootDomain}`, '');

    if (sub && sub !== rootDomain && !RESERVED_SUBDOMAINS.has(sub)) {
      if (
        !pathname.startsWith('/api/') &&
        !pathname.startsWith('/_next/') &&
        !pathname.startsWith('/auth/') &&
        !pathname.includes('.')
      ) {
        if (pathname === '/' || pathname === '') {
          const url = request.nextUrl.clone();
          url.pathname = `/s/${sub}`;
          const response = NextResponse.rewrite(url);

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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
