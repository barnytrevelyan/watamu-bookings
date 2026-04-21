/**
 * Place context — resolves the current place for a request.
 *
 * Precedence:
 *   1. `x-wb-place` request header (set by middleware from the URL path
 *      on kwetu.ke, e.g. `/watamu/...`).
 *   2. The request host's default place (e.g. watamubookings.com → Watamu).
 *
 * Every public page should read the current place from here and use it
 * to filter queries, render copy, and emit per-place SEO.
 */

import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Place, PlaceContext, PlaceHost } from '@/lib/types';

/** Cookie name carrying a comma-separated list of place slugs the viewer has
 * been granted preview access to (via /api/preview/unlock?token=...). */
export const PREVIEW_COOKIE = 'kwetu-preview';

/** Read the set of place slugs unlocked for preview in this request. */
async function getPreviewSlugs(): Promise<Set<string>> {
  try {
    const jar = await cookies();
    const raw = jar.get(PREVIEW_COOKIE)?.value ?? '';
    if (!raw) return new Set();
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/** True when the viewer is allowed to see the place at this visibility. */
function canSeePlace(place: Place, unlockedSlugs: Set<string>): boolean {
  if (place.visibility === 'public') return true;
  if (place.visibility === 'preview') return unlockedSlugs.has(place.slug);
  return false; // hidden
}

// Must match middleware constants.
export const PLACE_HEADER = 'x-wb-place';
export const HOST_HEADER = 'x-wb-host';

// Fallback used when the DB lookup fails during a build (no network, etc.)
// Keeps watamubookings.com rendering as Watamu rather than throwing.
const WATAMU_FALLBACK: Place = {
  id: '00000000-0000-0000-0000-000000000000',
  slug: 'watamu',
  name: 'Watamu',
  parent_place_id: null,
  kind: 'town',
  country_code: 'KE',
  centroid_lat: -3.354,
  centroid_lng: 40.019,
  bbox_north: null,
  bbox_south: null,
  bbox_east: null,
  bbox_west: null,
  default_zoom: 13,
  timezone: 'Africa/Nairobi',
  hero_image_url:
    'https://jiyoxdeiyydyxjymahrh.supabase.co/storage/v1/object/public/watamu-images/hero/watamu-hero.jpg',
  short_tagline: 'Your stay in Watamu starts here.',
  description:
    "Watamu is a coastal village in Kilifi County on Kenya's Indian Ocean coast, famous for the Watamu Marine National Park, deep-sea sport fishing, white-sand beaches and sea turtles.",
  seo_title: 'Watamu Bookings — Properties and fishing charters in Watamu, Kenya',
  seo_description:
    'Discover and book stunning beachfront properties and world-class fishing boat charters in Watamu, Kenya. Your gateway to paradise on the Kenyan coast.',
  activities_json: [],
  map_pois_json: [],
  visibility: 'public',
  features: ['properties', 'boats', 'tides', 'marine-park'],
  is_active: true,
  sort_order: 20,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const WATAMU_FALLBACK_HOST: PlaceContext['host'] = {
  host: 'kwetu.ke',
  brand_name: 'Kwetu',
  brand_short: 'Kwetu',
  is_multi_place: false,
  support_email: 'hello@kwetu.ke',
  support_whatsapp: null,
};

/** Strip :port, trim, lowercase. */
export function normaliseHost(raw: string | null | undefined): string {
  if (!raw) return 'kwetu.ke';
  return raw.split(',')[0]!.trim().toLowerCase();
}

/** Pull the resolved place + host from the current request. */
export async function getCurrentPlace(): Promise<PlaceContext> {
  const hdrs = await headers();
  const placeSlug = hdrs.get(PLACE_HEADER);
  const host = normaliseHost(hdrs.get(HOST_HEADER) ?? hdrs.get('host'));

  const supabase = await createClient();

  // Host config (brand + multi-place flag + default place)
  const { data: hostRow } = (await supabase
    .from('wb_place_hosts')
    .select('*')
    .eq('host', host)
    .maybeSingle()) as { data: PlaceHost | null };

  const hostCfg: PlaceContext['host'] = hostRow
    ? {
        host: hostRow.host,
        brand_name: hostRow.brand_name,
        brand_short: hostRow.brand_short,
        is_multi_place: hostRow.is_multi_place,
        support_email: hostRow.support_email,
        support_whatsapp: hostRow.support_whatsapp,
      }
    : WATAMU_FALLBACK_HOST;

  // Resolve the place: explicit slug header > host default > null (multi-place shell)
  let place: Place | null = null;

  if (placeSlug) {
    const { data } = await supabase
      .from('wb_places')
      .select('*')
      .eq('slug', placeSlug)
      .maybeSingle();
    place = (data as Place | null) ?? null;
  }

  if (!place && hostRow?.place_id) {
    const { data } = await supabase
      .from('wb_places')
      .select('*')
      .eq('id', hostRow.place_id)
      .maybeSingle();
    place = (data as Place | null) ?? null;
  }

  // Safety net: if DB is unreachable on a single-place host that looks
  // like Watamu (watamubookings.com or kwetu.ke with /watamu path),
  // keep rendering Watamu rather than throwing.
  if (
    !place &&
    !hostCfg.is_multi_place &&
    (host.includes('watamu') || placeSlug === 'watamu')
  ) {
    place = WATAMU_FALLBACK;
  }

  // Visibility gate: hidden places are always invisible, preview places only
  // for viewers whose kwetu-preview cookie opts them in.
  if (place) {
    const unlocked = await getPreviewSlugs();
    if (!canSeePlace(place, unlocked)) {
      place = null;
    }
  }

  return { place, host: hostCfg };
}

/**
 * Variant for server pages that must always have a place (single-place
 * hosts). Falls back to Watamu if the host config resolves to multi-place
 * but the caller needs a concrete place — returning null forces the
 * caller to branch.
 */
export async function requireCurrentPlace(): Promise<{
  place: Place;
  host: PlaceContext['host'];
}> {
  const ctx = await getCurrentPlace();
  if (!ctx.place) {
    // Caller is rendering a page that requires a concrete place. If the
    // host is multi-place the caller should route to the place picker
    // rather than call this.
    throw new Error('requireCurrentPlace: no place resolved for host');
  }
  return { place: ctx.place, host: ctx.host };
}

/** Fetch all places that should appear in the public place picker. Includes
 * places the viewer has unlocked via the preview cookie, so invited hosts
 * still see their in-progress destination. */
export async function listActivePlaces(): Promise<Place[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('wb_places')
    .select('*')
    .in('visibility', ['public', 'preview'])
    .neq('kind', 'county')
    .order('sort_order', { ascending: true });
  const rows = (data as Place[] | null) ?? [];
  const unlocked = await getPreviewSlugs();
  return rows.filter((p) => canSeePlace(p, unlocked));
}

/** Fetch all places (for admin). */
export async function listAllPlaces(): Promise<Place[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('wb_places')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data as Place[] | null) ?? [];
}

/** Fetch a place by slug. */
export async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('wb_places')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return (data as Place | null) ?? null;
}
