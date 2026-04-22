import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware that handles:
 * 1. Supabase auth session refresh (keeps cookies fresh)
 * 2. Host + path → place resolution (sets x-wb-host, x-wb-place)
 * 3. Subdomain rewriting for watamu.ke listing subdomains (e.g.
 *    unreel.watamu.ke → /s/unreel)
 */

// Subdomains that should never be treated as listing slugs or place slugs.
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

// Root domains we support legacy listing-slug subdomains on.
const SUBDOMAIN_HOSTS = ['watamu.ke'];

/**
 * Hosts that are multi-place shells. On these hosts the path's first
 * segment may be a place slug, e.g. `/watamu/properties`. Kept in code
 * (not just in the DB) so middleware can resolve without a DB hit.
 */
const MULTI_PLACE_HOSTS = new Set(['kwetu.ke', 'www.kwetu.ke']);

/** Place slugs recognised on the kwetu.ke path (must match wb_places.slug). */
const PLACE_SLUGS = new Set([
  'watamu',
  'malindi',
  'kilifi',
  'kilifi-county',
  'vipingo',
]);

/** Hosts that resolve directly to a fixed place (single-place hosts). */
const HOST_PLACE: Record<string, string> = {
  'localhost:3000': 'watamu',
  'localhost': 'watamu',
};

/**
 * Legacy hosts that should 301 to kwetu.ke/<place>/<path>. The value is the
 * destination place slug on kwetu.ke. Keeps any SEO built up on the old
 * domain while funnelling humans + bots onto the canonical brand.
 */
const LEGACY_REDIRECTS: Record<string, string> = {
  'watamubookings.com': 'watamu',
  'www.watamubookings.com': 'watamu',
};

export const PLACE_HEADER = 'x-wb-place';
export const HOST_HEADER = 'x-wb-host';
// Plain pathname header so server components (e.g. the root layout)
// can decide to skip chrome for bare-shell routes like /survey/*.
export const PATH_HEADER = 'x-wb-path';

function normaliseHost(raw: string | null | undefined): string {
  if (!raw) return 'kwetu.ke';
  return raw.split(',')[0]!.trim().toLowerCase();
}

export async function middleware(request: NextRequest) {
  // --- 0. Legacy host redirect (301 to kwetu.ke/<place>/<path>) ---
  // Runs before any Supabase work so we don't spend a roundtrip on a request
  // we're about to throw away. Skips /api/ and /_next/ so webhooks + assets
  // keep working on the old host during the transition.
  const rawHost = (request.headers.get('host') ?? request.nextUrl.hostname).toLowerCase();
  const normalisedHost = rawHost.split(':')[0];
  const legacyPlace = LEGACY_REDIRECTS[normalisedHost] ?? LEGACY_REDIRECTS[rawHost];
  if (
    legacyPlace &&
    !request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/_next/')
  ) {
    const target = request.nextUrl.clone();
    target.protocol = 'https:';
    target.host = 'kwetu.ke';
    target.port = '';
    const path = request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname;
    target.pathname = `/${legacyPlace}${path}`;
    return NextResponse.redirect(target, 301);
  }

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

  await supabase.auth.getSession();

  // --- 2. Place resolution ---
  // Expose the request host to server components via a header so
  // `getCurrentPlace()` can read it without another round trip.
  const { hostname, pathname } = request.nextUrl;
  const hostPort = request.headers.get('host') ?? hostname;
  const host = normaliseHost(hostPort);

  request.headers.set(HOST_HEADER, host);
  request.headers.set(PATH_HEADER, pathname);
  supabaseResponse.headers.set(HOST_HEADER, host);
  supabaseResponse.headers.set(PATH_HEADER, pathname);

  // Default place for the host (single-place hosts). Empty = multi-place
  // shell, the place will come from the path segment (below).
  let placeSlug: string | null = HOST_PLACE[host] ?? null;

  // On multi-place hosts, look for a place slug as the first path segment:
  //   kwetu.ke/watamu/properties → place = watamu
  if (MULTI_PLACE_HOSTS.has(host)) {
    const seg = pathname.split('/').filter(Boolean)[0];
    if (seg && PLACE_SLUGS.has(seg)) {
      placeSlug = seg;
    } else {
      placeSlug = null;
    }
  }

  if (placeSlug) {
    request.headers.set(PLACE_HEADER, placeSlug);
    supabaseResponse.headers.set(PLACE_HEADER, placeSlug);
  }

  // --- 2b. Strip /<place-slug> prefix on multi-place hosts so /watamu/xxx
  // resolves the same file-based route as /xxx. Place is still available
  // server-side via the x-wb-place header (propagated explicitly via
  // request.headers so Server Components see it through next/headers).
  if (MULTI_PLACE_HOSTS.has(host)) {
    const seg = pathname.split('/').filter(Boolean)[0];
    if (seg && PLACE_SLUGS.has(seg)) {
      const rewritten = request.nextUrl.clone();
      const rest = pathname.slice(`/${seg}`.length) || '/';
      rewritten.pathname = rest;

      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.set(HOST_HEADER, host);
      forwardedHeaders.set(PLACE_HEADER, seg);
      // Keep the pathname header pointing at the *stripped* path so the
      // root layout's chrome-skip logic sees `/survey/host` rather than
      // `/watamu/survey/host`.
      forwardedHeaders.set(PATH_HEADER, rest);

      const response = NextResponse.rewrite(rewritten, {
        request: { headers: forwardedHeaders },
      });
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      response.headers.set(HOST_HEADER, host);
      response.headers.set(PLACE_HEADER, seg);
      response.headers.set(PATH_HEADER, rest);
      return response;
    }
  }

  // --- 3. Legacy listing-slug subdomains on watamu.ke ---
  const rootDomain = SUBDOMAIN_HOSTS.find((domain) => hostname.endsWith(domain));

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
          const response = NextResponse.rewrite(url, { request });

          supabaseResponse.cookies.getAll().forEach((cookie) => {
            response.cookies.set(cookie.name, cookie.value);
          });

          response.headers.set('x-subdomain-slug', sub);
          response.headers.set('x-subdomain-host', hostname);
          response.headers.set(HOST_HEADER, host);
          if (placeSlug) response.headers.set(PLACE_HEADER, placeSlug);
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
