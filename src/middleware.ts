import { NextRequest, NextResponse } from 'next/server';

/**
 * Subdomain routing middleware for watamu.ke
 *
 * Each boat and property gets its own subdomain:
 *   unreel.watamu.ke    → /boats/unreel
 *   sunset-villa.watamu.ke → /properties/sunset-villa
 *
 * The middleware rewrites the request internally so the slug pages handle rendering.
 * We first check boats, then properties (slug collision is unlikely since they're
 * different listing types with different naming conventions).
 *
 * Main domain (watamu.ke, www.watamu.ke) passes through unchanged.
 * watamubookings.com also passes through unchanged.
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

export function middleware(request: NextRequest) {
  const { hostname, pathname } = request.nextUrl;

  // Only process subdomain logic for our subdomain-enabled domains
  const rootDomain = SUBDOMAIN_HOSTS.find((domain) => hostname.endsWith(domain));

  if (!rootDomain) {
    // Not a subdomain-enabled host (e.g. watamubookings.com, localhost)
    return NextResponse.next();
  }

  // Extract subdomain: "unreel.watamu.ke" → "unreel"
  const sub = hostname.replace(`.${rootDomain}`, '');

  // No subdomain or reserved subdomain — pass through
  if (!sub || sub === rootDomain || RESERVED_SUBDOMAINS.has(sub)) {
    return NextResponse.next();
  }

  // Don't rewrite API routes, static files, or Next.js internals
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/auth/') ||
    pathname.includes('.') // Static files like favicon.ico, images, etc.
  ) {
    return NextResponse.next();
  }

  // Rewrite to the subdomain resolver page which checks if the slug
  // is a boat or property and redirects accordingly
  const url = request.nextUrl.clone();

  if (pathname === '/' || pathname === '') {
    // Root of subdomain → rewrite to subdomain resolver
    url.pathname = `/s/${sub}`;
    const response = NextResponse.rewrite(url);
    response.headers.set('x-subdomain-slug', sub);
    response.headers.set('x-subdomain-host', hostname);
    return response;
  }

  // Allow normal navigation on subdomain for sub-paths
  // (e.g. unreel.watamu.ke/auth/login still works)
  return NextResponse.next();
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
