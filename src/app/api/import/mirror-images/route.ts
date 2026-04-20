import { NextRequest, NextResponse } from 'next/server';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { resolveImportUser } from '@/lib/import-auth';
import { mirrorImageList } from '@/lib/image-mirror';

/**
 * POST /api/import/mirror-images
 *
 * Client calls this during save to download each externally-hosted image and
 * upload a copy into our Supabase storage bucket. The response preserves
 * input order; any image that fails to mirror comes back as its original URL
 * so the listing still works (just without the storage mirror).
 *
 * Body: { urls: string[]; listing_type: 'property' | 'boat' }
 * Returns: { urls: string[] }
 */

const MAX_URLS_PER_REQUEST = 40;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveImportUser(request);
    if (!auth.ok) return auth.response;
    const { user, accessToken } = auth.result;

    const body = await request.json().catch(() => ({}));
    const urlsIn: unknown = body?.urls;
    const listingType = body?.listing_type === 'boat' ? 'boat' : 'property';

    if (!Array.isArray(urlsIn) || urlsIn.length === 0) {
      return NextResponse.json(
        { error: 'Provide a non-empty urls array' },
        { status: 400 }
      );
    }
    if (urlsIn.length > MAX_URLS_PER_REQUEST) {
      return NextResponse.json(
        { error: `At most ${MAX_URLS_PER_REQUEST} images per request` },
        { status: 400 }
      );
    }
    const urls = (urlsIn as unknown[])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);

    if (urls.length === 0) {
      return NextResponse.json({ urls: [] });
    }

    // Build a user-scoped client so the upload is subject to the same storage
    // RLS policies that the rest of the app uses. We pass the JWT we already
    // validated via resolveImportUser so the storage API sees the caller.
    const supabase = createPlainClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const mirrored = await mirrorImageList(urls, {
      ownerId: user.id,
      listingType,
      supabase,
    });

    return NextResponse.json({ urls: mirrored });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to mirror images' },
      { status: 500 }
    );
  }
}
