/**
 * Server-side tool executors for the site chatbot.
 *
 * Each executor takes the Claude-produced `tool_use` input and returns a
 * compact JSON object that becomes the `tool_result`. The outputs here are
 * the bot's only source of truth about stays, boats, prices and policy —
 * the system prompt forbids it from inventing facts.
 *
 * Two rules of thumb when editing:
 *   1. Keep responses small. The model has to read and reason over them;
 *      every kilobyte of noise slows the loop and raises cost.
 *   2. Never leak secrets or per-host data. Phase 1 is read-only,
 *      published-only, anonymous-user-only.
 */

import { createClient } from '@/lib/supabase/server';
import { resolveFlexiConfig, computeFlexiPrice } from '@/lib/flexi';
import { searchDocs as searchDocsCorpus } from './docs';

const PLACE_SLUGS = new Set([
  'watamu',
  'malindi',
  'kilifi',
  'kilifi-county',
  'vipingo',
]);

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Clamp slugs to a sane length. Slugs come from Claude, whose inputs come
 *  from guest text, so the worst case is Claude hallucinating a 10KB slug
 *  and us pushing it into a Supabase query. Never legitimate. */
function clampSlug(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > 120 ? s.slice(0, 120) : s;
}

/** Clamp an arbitrary numeric input to a safe range. */
function clampNumber(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

/** Build a canonical /properties?... URL from the filters the bot used. */
function buildPropertiesUrl(filters: {
  place?: string;
  check_in?: string;
  check_out?: string;
  guests?: number;
  bedrooms_min?: number;
  max_price_kes?: number;
  amenityIds?: string[];
  last_minute_only?: boolean;
}): string {
  const params = new URLSearchParams();
  if (filters.place) params.set('places', filters.place);
  if (filters.check_in) params.set('check_in', filters.check_in);
  if (filters.check_out) params.set('check_out', filters.check_out);
  if (filters.guests) params.set('guests', String(filters.guests));
  if (filters.bedrooms_min) params.set('bedrooms', String(filters.bedrooms_min));
  if (filters.max_price_kes) params.set('max_price', String(filters.max_price_kes));
  if (filters.amenityIds && filters.amenityIds.length > 0) {
    params.set('amenities', filters.amenityIds.join(','));
  }
  if (filters.last_minute_only) params.set('last_minute', '1');
  const qs = params.toString();
  return `/properties${qs ? `?${qs}` : ''}`;
}

function buildBoatsUrl(filters: { place?: string; trip_type?: string }): string {
  const params = new URLSearchParams();
  if (filters.place) params.set('places', filters.place);
  if (filters.trip_type) params.set('trip_type', filters.trip_type);
  const qs = params.toString();
  return `/boats${qs ? `?${qs}` : ''}`;
}

/** Resolve amenity names (e.g. "pool", "beachfront") to amenity IDs. */
async function resolveAmenityIds(
  supa: Awaited<ReturnType<typeof createClient>>,
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  const { data } = await supa
    .from('wb_amenities')
    .select('id, name')
    .limit(200);
  if (!data) return [];
  const ids: string[] = [];
  for (const wanted of names) {
    const w = wanted.trim().toLowerCase();
    const match = data.find(
      (a: { id: string; name: string }) =>
        a.name.toLowerCase().includes(w) || w.includes(a.name.toLowerCase()),
    );
    if (match) ids.push((match as { id: string }).id);
  }
  return ids;
}

/** Resolve place slug → place ID (one row). */
async function resolvePlaceId(
  supa: Awaited<ReturnType<typeof createClient>>,
  slug: string,
): Promise<string | null> {
  const { data } = await supa
    .from('wb_places')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

interface SearchListingsInput {
  kind?: 'property' | 'boat';
  place?: string;
  check_in?: string;
  check_out?: string;
  guests?: number;
  bedrooms_min?: number;
  max_price_kes?: number;
  amenities?: string[];
  last_minute_only?: boolean;
}

export async function execSearchListings(
  input: SearchListingsInput,
): Promise<Record<string, unknown>> {
  const supa = await createClient();
  const kind = input.kind ?? 'property';

  // Normalise place input. If the model passes a free-text place, only
  // honour it when it matches a known slug.
  const place =
    input.place && PLACE_SLUGS.has(input.place.toLowerCase())
      ? input.place.toLowerCase()
      : undefined;

  // Clamp numeric inputs so a hallucinated 10-billion-KES filter or
  // negative-bedroom query can't produce strange Supabase queries.
  const guests = clampNumber(input.guests, 1, 50);
  const bedroomsMin = clampNumber(input.bedrooms_min, 1, 20);
  const maxPriceKes = clampNumber(input.max_price_kes, 1, 5_000_000);

  if (kind === 'boat') {
    const selectCols = `
      id, slug, name, boat_type, capacity, summary,
      trips:wb_boat_trips(id, name, trip_type, duration_hours, price_total)
    `;
    let q: any;
    if (place) {
      const placeId = await resolvePlaceId(supa, place);
      if (!placeId) return { matches: [], total: 0, url: buildBoatsUrl({ place }) };
      q = supa
        .from('wb_boats')
        .select(`${selectCols}, wb_boat_places!inner(place_id)`, { count: 'exact' })
        .eq('wb_boat_places.place_id', placeId);
    } else {
      q = supa.from('wb_boats').select(selectCols, { count: 'exact' });
    }
    q = q.eq('is_published', true).eq('is_test', false);
    // Apply guests → capacity filter at the DB. max_price is post-filter
    // because boat prices live on wb_boat_trips, not the boat row.
    if (guests) q = q.gte('capacity', guests);
    q = q.limit(8);
    const { data, count } = await q;
    let matches = (data ?? []).map((b: any) => {
      const cheapestTrip = Array.isArray(b.trips) && b.trips.length > 0
        ? b.trips.reduce((lo: any, t: any) =>
            Number(t.price_total) < Number(lo.price_total) ? t : lo,
          )
        : null;
      return {
        slug: b.slug,
        name: b.name,
        boat_type: b.boat_type,
        capacity: b.capacity,
        summary: b.summary,
        from_price_kes: cheapestTrip ? Number(cheapestTrip.price_total) : null,
        trip_types: Array.isArray(b.trips)
          ? Array.from(new Set(b.trips.map((t: any) => t.trip_type)))
          : [],
        url: `/boats/${b.slug}`,
      };
    });
    if (maxPriceKes) {
      matches = matches.filter(
        (m: any) => m.from_price_kes == null || m.from_price_kes <= maxPriceKes,
      );
    }
    return {
      kind: 'boat',
      matches,
      total: maxPriceKes ? matches.length : count ?? matches.length,
      url: buildBoatsUrl({ place }),
    };
  }

  // --- Property search ---
  let q = supa
    .from('wb_properties')
    .select(
      `id, slug, name, summary, city, property_type, bedrooms, bathrooms, max_guests,
       base_price_per_night, flexi_enabled, flexi_window_days, flexi_cutoff_days,
       flexi_floor_percent, is_published, is_test,
       owner:wb_profiles!wb_properties_owner_id_fkey(flexi_default_enabled, flexi_default_window_days, flexi_default_cutoff_days, flexi_default_floor_percent)`,
      { count: 'exact' },
    )
    .eq('is_published', true)
    .eq('is_test', false);

  if (place) {
    const placeId = await resolvePlaceId(supa, place);
    if (!placeId) {
      return {
        kind: 'property',
        matches: [],
        total: 0,
        url: buildPropertiesUrl({ place }),
      };
    }
    // Properties are joined to places via wb_property_places; fall back to
    // city text match if the junction isn't populated. (Same pattern as the
    // main /properties page uses via filterPropertiesByPlace.)
    const { data: propPlaces } = await supa
      .from('wb_property_places')
      .select('property_id')
      .eq('place_id', placeId);
    const propIds = (propPlaces ?? []).map((r: any) => r.property_id);
    if (propIds.length > 0) {
      q = q.in('id', propIds);
    } else {
      // Fall back to city ILIKE so place-slug search still works before the
      // junction is fully populated.
      q = q.ilike('city', `%${place}%`);
    }
  }

  if (guests) q = q.gte('max_guests', guests);
  if (bedroomsMin) q = q.gte('bedrooms', bedroomsMin);
  if (maxPriceKes) q = q.lte('base_price_per_night', maxPriceKes);
  if (input.last_minute_only) q = q.eq('flexi_enabled', true);

  // Clamp amenity list size + per-string length. Legitimate queries are
  // 1–4 amenities; if Claude hallucinates a 200-item list we don't want
  // to do 200 case-insensitive LIKE scans.
  const wantedAmenities = (input.amenities ?? [])
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .slice(0, 8)
    .map((a) => (a.length > 64 ? a.slice(0, 64) : a));
  const amenityIds = await resolveAmenityIds(supa, wantedAmenities);
  if (wantedAmenities.length > 0 && amenityIds.length === 0) {
    // User asked for amenities we don't carry — return nothing.
    return {
      kind: 'property',
      matches: [],
      total: 0,
      url: buildPropertiesUrl({
        place,
        check_in: input.check_in,
        check_out: input.check_out,
        guests,
        bedrooms_min: bedroomsMin,
        max_price_kes: maxPriceKes,
        last_minute_only: input.last_minute_only,
      }),
    };
  }
  if (amenityIds.length > 0) {
    const { data: links } = await supa
      .from('wb_property_amenities')
      .select('property_id, amenity_id')
      .in('amenity_id', amenityIds);
    const counts: Record<string, number> = {};
    (links ?? []).forEach((r: any) => {
      counts[r.property_id] = (counts[r.property_id] ?? 0) + 1;
    });
    const matching = Object.keys(counts).filter((pid) => counts[pid] === amenityIds.length);
    if (matching.length === 0) {
      return {
        kind: 'property',
        matches: [],
        total: 0,
        url: buildPropertiesUrl({
          place,
          check_in: input.check_in,
          check_out: input.check_out,
          guests,
          bedrooms_min: bedroomsMin,
          max_price_kes: maxPriceKes,
          amenityIds,
          last_minute_only: input.last_minute_only,
        }),
      };
    }
    q = q.in('id', matching);
  }

  // Date-range filter: exclude properties that have any blocked day
  // inside the window. Identical approach to /properties/page.tsx.
  if (isIsoDate(input.check_in) && isIsoDate(input.check_out)) {
    const { data: blocked } = await supa
      .from('wb_availability')
      .select('property_id')
      .gte('date', input.check_in)
      .lte('date', input.check_out)
      .eq('is_blocked', true);
    if (blocked && blocked.length > 0) {
      const exclude = [...new Set(blocked.map((r: any) => r.property_id))];
      q = q.not('id', 'in', `(${exclude.join(',')})`);
    }
  }

  q = q
    .order('is_featured', { ascending: false })
    .order('base_price_per_night', { ascending: true })
    .limit(8);

  const { data, count } = await q;

  const matches = (data ?? []).map((p: any) => {
    const owner = Array.isArray(p.owner) ? p.owner[0] : p.owner;
    const flexi = resolveFlexiConfig(p, owner ?? null);
    let flexi_price_per_night: number | null = null;
    if (flexi.enabled && isIsoDate(input.check_in)) {
      const r = computeFlexiPrice(
        Number(p.base_price_per_night) || 0,
        flexi,
        input.check_in,
      );
      if (!r.pastCutoff && r.isLastMinute) flexi_price_per_night = r.effectivePrice;
    }
    return {
      slug: p.slug,
      name: p.name,
      summary: p.summary,
      city: p.city,
      property_type: p.property_type,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      max_guests: p.max_guests,
      price_per_night_kes: Number(p.base_price_per_night) || 0,
      flexi_price_per_night_kes: flexi_price_per_night,
      url: `/properties/${p.slug}`,
    };
  });

  return {
    kind: 'property',
    matches,
    total: count ?? matches.length,
    url: buildPropertiesUrl({
      place,
      check_in: input.check_in,
      check_out: input.check_out,
      guests,
      bedrooms_min: bedroomsMin,
      max_price_kes: maxPriceKes,
      amenityIds,
      last_minute_only: input.last_minute_only,
    }),
  };
}

interface GetListingInput {
  kind?: 'property' | 'boat';
  slug?: string;
}

export async function execGetListing(
  input: GetListingInput,
): Promise<Record<string, unknown>> {
  const slug = clampSlug(input.slug);
  if (!slug) return { error: 'slug is required' };
  const supa = await createClient();
  const kind = input.kind ?? 'property';

  if (kind === 'boat') {
    const { data } = await supa
      .from('wb_boats')
      .select(
        `id, slug, name, boat_type, capacity, summary, description,
         trips:wb_boat_trips(id, name, trip_type, duration_hours, price_total, description, is_active)`,
      )
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('is_test', false)
      .maybeSingle();
    if (!data) return { error: 'Boat not found' };
    return {
      kind: 'boat',
      slug: data.slug,
      name: data.name,
      boat_type: data.boat_type,
      capacity: data.capacity,
      summary: data.summary,
      description: data.description,
      trips: (data.trips ?? []).filter((t: any) => t.is_active),
      url: `/boats/${data.slug}`,
    };
  }

  const { data } = await supa
    .from('wb_properties')
    .select(
      `id, slug, name, summary, description, city, property_type, bedrooms,
       bathrooms, max_guests, base_price_per_night, cleaning_fee, flexi_enabled,
       amenities:wb_property_amenities(amenity:wb_amenities(name))`,
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('is_test', false)
    .maybeSingle();
  if (!data) return { error: 'Property not found' };

  const amenities = Array.isArray(data.amenities)
    ? data.amenities
        .map((row: any) => row.amenity?.name)
        .filter(Boolean)
    : [];

  return {
    kind: 'property',
    slug: data.slug,
    name: data.name,
    summary: data.summary,
    description: data.description,
    city: data.city,
    property_type: data.property_type,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    max_guests: data.max_guests,
    price_per_night_kes: Number(data.base_price_per_night) || 0,
    cleaning_fee_kes: Number(data.cleaning_fee) || 0,
    flexi_enabled: Boolean(data.flexi_enabled),
    amenities,
    url: `/properties/${data.slug}`,
  };
}

interface CheckAvailabilityInput {
  kind?: 'property' | 'boat';
  slug?: string;
  check_in?: string;
  check_out?: string;
  trip_date?: string;
}

export async function execCheckAvailability(
  input: CheckAvailabilityInput,
): Promise<Record<string, unknown>> {
  const slug = clampSlug(input.slug);
  if (!slug) return { error: 'slug is required' };
  const supa = await createClient();
  const kind = input.kind ?? 'property';

  if (kind === 'boat') {
    if (!isIsoDate(input.trip_date)) {
      return { error: 'trip_date (YYYY-MM-DD) is required for boats' };
    }
    const { data: boat } = await supa
      .from('wb_boats')
      .select('id')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (!boat) return { error: 'Boat not found' };
    const { data: ok } = await supa.rpc('wb_check_boat_availability', {
      p_boat_id: boat.id,
      p_trip_date: input.trip_date,
    });
    return {
      kind: 'boat',
      slug,
      trip_date: input.trip_date,
      available: Boolean(ok),
    };
  }

  if (!isIsoDate(input.check_in) || !isIsoDate(input.check_out)) {
    return { error: 'check_in and check_out (YYYY-MM-DD) are required' };
  }
  const { data: prop } = await supa
    .from('wb_properties')
    .select('id')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (!prop) return { error: 'Property not found' };
  const { data: ok } = await supa.rpc('wb_check_property_availability', {
    p_property_id: prop.id,
    p_check_in: input.check_in,
    p_check_out: input.check_out,
  });
  return {
    kind: 'property',
    slug,
    check_in: input.check_in,
    check_out: input.check_out,
    available: Boolean(ok),
  };
}

export async function execGetPrice(
  input: CheckAvailabilityInput,
): Promise<Record<string, unknown>> {
  const slug = clampSlug(input.slug);
  if (!slug) return { error: 'slug is required' };
  const supa = await createClient();
  const kind = input.kind ?? 'property';

  if (kind === 'boat') {
    const { data: boat } = await supa
      .from('wb_boats')
      .select(
        `id, slug, name,
         trips:wb_boat_trips(id, name, trip_type, price_total, duration_hours, is_active)`,
      )
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (!boat) return { error: 'Boat not found' };
    const activeTrips = (boat.trips ?? []).filter((t: any) => t.is_active);
    return {
      kind: 'boat',
      slug: boat.slug,
      trips: activeTrips.map((t: any) => ({
        name: t.name,
        trip_type: t.trip_type,
        duration_hours: t.duration_hours,
        price_kes: Number(t.price_total) || 0,
      })),
      currency: 'KES',
    };
  }

  if (!isIsoDate(input.check_in) || !isIsoDate(input.check_out)) {
    return { error: 'check_in and check_out (YYYY-MM-DD) are required' };
  }
  const { data: p } = await supa
    .from('wb_properties')
    .select(
      `id, slug, name, base_price_per_night, cleaning_fee, flexi_enabled,
       flexi_window_days, flexi_cutoff_days, flexi_floor_percent,
       owner:wb_profiles!wb_properties_owner_id_fkey(flexi_default_enabled, flexi_default_window_days, flexi_default_cutoff_days, flexi_default_floor_percent)`,
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (!p) return { error: 'Property not found' };

  const owner = Array.isArray(p.owner) ? p.owner[0] : p.owner;
  const flexi = resolveFlexiConfig(p, owner ?? null);
  const base = Number(p.base_price_per_night) || 0;
  const nights =
    Math.ceil(
      (new Date(input.check_out).getTime() - new Date(input.check_in).getTime()) /
        (1000 * 60 * 60 * 24),
    ) || 0;

  // Walk the ramp night-by-night so multi-night flexi stays get the correct
  // subtotal (same logic the booking API uses).
  let accommodation = 0;
  let flexiActive = false;
  for (let i = 0; i < nights; i++) {
    const d = new Date(input.check_in);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (flexi.enabled) {
      const r = computeFlexiPrice(base, flexi, iso);
      if (!r.pastCutoff) {
        accommodation += r.effectivePrice;
        if (r.isLastMinute) flexiActive = true;
      } else {
        accommodation += base;
      }
    } else {
      accommodation += base;
    }
  }
  const cleaning = Number(p.cleaning_fee) || 0;
  const total = accommodation + cleaning;

  return {
    kind: 'property',
    slug: p.slug,
    check_in: input.check_in,
    check_out: input.check_out,
    nights,
    base_price_per_night_kes: base,
    accommodation_kes: accommodation,
    cleaning_fee_kes: cleaning,
    total_kes: total,
    flexi_discount_active: flexiActive,
    currency: 'KES',
  };
}

export function execSearchDocs(input: { query?: string }): Record<string, unknown> {
  // Cap the query. The corpus ranker only needs a few words; accepting a
  // 10KB query just wastes CPU in the regex split.
  const raw = (input?.query ?? '').toString();
  const q = raw.length > 400 ? raw.slice(0, 400) : raw;
  const hits = searchDocsCorpus(q, 3);
  return {
    query: q,
    results: hits.map((h) => ({
      title: h.title,
      url: h.url,
      body: h.body,
    })),
  };
}

/**
 * Dispatch a tool call by name. Unknown tool names return a visible error
 * string rather than throwing, so Claude can self-correct.
 */
export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'search_listings':
      return execSearchListings(input as SearchListingsInput);
    case 'get_listing':
      return execGetListing(input as GetListingInput);
    case 'check_availability':
      return execCheckAvailability(input as CheckAvailabilityInput);
    case 'get_price':
      return execGetPrice(input as CheckAvailabilityInput);
    case 'search_docs':
      return execSearchDocs(input as { query?: string });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
