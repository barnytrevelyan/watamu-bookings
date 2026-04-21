import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/preview/unlock?slug=kilifi,malindi[&token=...]&redirect=/kilifi
 *
 * Sets the `kwetu-preview` cookie with the comma-separated place slugs. Used
 * to let invited hosts / admins see destinations whose visibility is still
 * 'preview' before public launch.
 *
 * If KWETU_PREVIEW_TOKEN is set the `token` query parameter must match —
 * this stops the URL being trivially discoverable by bots. In dev without
 * the env var the endpoint is open.
 */
export async function GET(request: NextRequest) {
  const requiredToken = process.env.KWETU_PREVIEW_TOKEN;
  const providedToken = request.nextUrl.searchParams.get('token');
  if (requiredToken && providedToken !== requiredToken) {
    return new NextResponse('Not authorised', { status: 403 });
  }

  const slugParam = request.nextUrl.searchParams.get('slug') ?? '';
  const newSlugs = slugParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z][a-z0-9-]*$/.test(s));

  if (newSlugs.length === 0) {
    return new NextResponse('Missing or invalid slug', { status: 400 });
  }

  const existing = (request.cookies.get('kwetu-preview')?.value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const merged = Array.from(new Set([...existing, ...newSlugs])).join(',');

  const redirect = request.nextUrl.searchParams.get('redirect') ?? `/${newSlugs[0]}`;
  const target = new URL(redirect, request.nextUrl.origin);

  const response = NextResponse.redirect(target, 302);
  response.cookies.set('kwetu-preview', merged, {
    httpOnly: false, // readable by client components for UI hints
    sameSite: 'lax',
    path: '/',
    // ~90 days — long enough for onboarding, short enough that abandoned
    // unlocks eventually expire.
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
