import { createClient as createPlainClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

/**
 * Download a remote image and upload a copy to our own Supabase storage so
 * that imported listings don't go dark if the source website removes the
 * image (or the property).
 *
 * The bucket we target is `watamu-images` — the same bucket /dashboard/boats/new
 * and /dashboard/properties/new already write to. It is expected to be public.
 *
 * This helper deliberately returns the original URL on failure so that a
 * single broken image never blocks an import: the client will still see a
 * valid listing with a remote image URL, just without the storage mirror.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 15_000;
export const BUCKET = 'watamu-images';

/** Block link-local / private addresses to avoid SSRF through mirror. */
export function isSafeImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (!host) return false;
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    if (
      /^10\./.test(host) ||
      /^127\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extensionFor(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('avif')) return 'avif';
  const m = url.match(/\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return 'jpg';
}

export interface MirrorOptions {
  ownerId: string;
  listingType: 'property' | 'boat';
  /** If provided, use this Supabase client (user-scoped). Otherwise a service
   *  client is created from SUPABASE_SERVICE_ROLE_KEY. Passing a user client
   *  is preferable because it respects RLS policies. */
  supabase?: SupabaseClient;
}

/**
 * Mirror a single URL. Returns the storage public URL, or the original URL
 * on any failure.
 */
export async function mirrorOneImage(
  sourceUrl: string,
  opts: MirrorOptions
): Promise<string> {
  if (!isSafeImageUrl(sourceUrl)) return sourceUrl;

  // If this URL is already pointing at our own storage bucket, leave it alone.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl && sourceUrl.startsWith(supabaseUrl)) return sourceUrl;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(sourceUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WatamuBookingsImport/1.0',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    if (!resp.ok) return sourceUrl;

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    // Accept image/* plus a few content types that Airbnb/Booking serve.
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      return sourceUrl;
    }

    const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
    if (contentLength && contentLength > MAX_IMAGE_BYTES) return sourceUrl;

    const buf = await resp.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return sourceUrl;
    if (buf.byteLength < 1024) return sourceUrl; // likely a 1px tracker or error page

    const ext = extensionFor(contentType, sourceUrl);
    const path = `imports/${opts.listingType}/${opts.ownerId}/${Date.now()}-${randomUUID()}.${ext}`;

    const client =
      opts.supabase ??
      createPlainClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

    const uploadCt = contentType.startsWith('image/') ? contentType : `image/${ext}`;
    const { error: uploadErr } = await client.storage
      .from(BUCKET)
      .upload(path, buf, {
        contentType: uploadCt,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadErr) return sourceUrl;

    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || sourceUrl;
  } catch {
    return sourceUrl;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mirror an array of URLs. Preserves the input order. Runs up to
 * `concurrency` downloads in parallel to keep total latency manageable —
 * 20 images at 15s each serial would blow past Vercel's 60s function cap.
 */
export async function mirrorImageList(
  urls: string[],
  opts: MirrorOptions,
  concurrency = 4
): Promise<string[]> {
  const out: string[] = new Array(urls.length).fill('');
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= urls.length) return;
      out[idx] = await mirrorOneImage(urls[idx], opts);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    () => worker()
  );
  await Promise.all(workers);
  return out;
}
