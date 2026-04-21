import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/preview/lock[?redirect=/]
 *
 * Clears the kwetu-preview cookie, re-hiding preview-stage places.
 */
export async function GET(request: NextRequest) {
  const redirect = request.nextUrl.searchParams.get('redirect') ?? '/';
  const target = new URL(redirect, request.nextUrl.origin);
  const response = NextResponse.redirect(target, 302);
  response.cookies.set('kwetu-preview', '', { path: '/', maxAge: 0 });
  return response;
}
