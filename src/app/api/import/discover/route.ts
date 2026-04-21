import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getCurrentPlace } from '@/lib/places/context';
import { resolveImportUser } from '@/lib/import/auth';
import {
  sanitiseUrl,
  fetchSafe,
  buildPageBrief,
  extractListingCandidateLinks,
} from '@/lib/import/shared';

/**
 * POST /api/import/discover
 *
 * Multi-listing discovery for "paste the homepage" imports.
 *
 * A lot of small operators (Watamu cottages, fishing lodges, dhow charters)
 * advertise multiple listings on a single website — e.g. unreelexperience.com
 * has two cottages ("Utulivu" and "Urumwe") on /accommodation and one boat
 * ("UnReel 33ft Blackfin") on /fishing-1. The existing /api/import/generic
 * endpoint assumes one page = one listing and only ever returns a single
 * extraction, which collapses multi-listing sites into a single fuzzy record.
 *
 * This route fans out from the pasted URL:
 *   1. Fetches the entry page.
 *   2. Uses a keyword-scored link extractor to find up to MAX_SUBPAGES same-
 *      origin URLs that look like listing pages (accommodation / cottage /
 *      villa / boat / charter / fishing / etc).
 *   3. Fetches each candidate (sequentially, short timeout) and concatenates
 *      the briefs.
 *   4. Asks the LLM to return an array of listings using a strict schema.
 *   5. Post-processes (clamps, picks images per listing, enforces enum
 *      defaults) and returns `{ listings: [...] }`.
 *
 * Body: { url: string }
 * Returns:
 *   { listings: Array<{ listing_type: 'property' | 'boat'; source_url: string; ...fields }> }
 *
 * Env vars (set on Vercel):
 *   WATAMU_AI_API_KEY   (required)  – OpenAI API key
 *   WATAMU_AI_PROVIDER  (optional)  – "openai" (default)
 *   WATAMU_AI_MODEL     (optional)  – defaults to "gpt-4o"
 */

const MAX_SUBPAGES = 4;
const SUBPAGE_TIMEOUT_MS = 10_000;

const PROPERTY_TYPES = ['villa', 'apartment', 'cottage', 'house', 'hotel', 'guesthouse', 'banda', 'penthouse'];
const BOAT_TYPES = ['sport_fisher', 'catamaran', 'dhow', 'yacht', 'sailboat', 'speedboat'];
const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict', 'non_refundable'];
const TRIP_TYPES = ['half_day', 'half_day_morning', 'half_day_afternoon', 'full_day', 'overnight', 'multi_day', 'sunset_cruise'];

// ---------------------------------------------------------------------------
// Types mirroring what /api/import/generic returns — the dashboard import
// wizard reuses the same renderers for property + boat previews, so we keep
// shapes identical.
// ---------------------------------------------------------------------------

interface ImportedProperty {
  listing_type: 'property';
  name: string;
  description: string;
  property_type: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  price_per_night: number | null;
  currency: string;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  amenities: string[];
  house_rules: string[];
  check_in_time: string | null;
  check_out_time: string | null;
  min_nights: number | null;
  max_nights: number | null;
  cleaning_fee: number | null;
  security_deposit: number | null;
  cancellation_policy: string | null;
  images: string[];
  rating: number | null;
  review_count: number | null;
  source_url: string;
  source: 'generic';
}

interface ImportedTrip {
  name: string;
  duration_hours: number | null;
  price_total: number | null;
  price_per_person: number | null;
  trip_type: string;
  departure_time: string | null;
  description: string;
  includes: string[];
  target_species: string[];
}

interface ImportedBoat {
  listing_type: 'boat';
  name: string;
  description: string;
  boat_type: string;
  length_ft: number | null;
  capacity: number | null;
  crew_size: number | null;
  captain_name: string | null;
  captain_bio: string | null;
  captain_experience_years: number | null;
  target_species: string[];
  fishing_techniques: string[];
  trips: ImportedTrip[];
  departure_point: string | null;
  images: string[];
  rating: number | null;
  review_count: number | null;
  location: string;
  source_url: string;
  source: 'generic';
}

type ImportedListing = ImportedProperty | ImportedBoat;

// ---------------------------------------------------------------------------
// LLM call — multi-listing extraction.
// ---------------------------------------------------------------------------

function buildSystemPrompt(brandName: string, placeName: string): string {
  return `You are a data-extraction assistant for ${brandName}, a property and boat-charter booking marketplace in ${placeName}, Kenya.

You will receive one or more condensed briefs from a single small-operator website (usually a homepage plus 1–4 sub-pages). Many of these operators advertise multiple distinct listings on their site — for example, a lodge with two cottages AND a fishing boat charter; or a guesthouse with a villa and an apartment. Your job is to identify every DISTINCT bookable listing and extract each one as its own record.

What counts as a distinct listing:
- Each named, individually bookable accommodation (cottage, villa, apartment, suite, house, banda, lodge, hotel room TYPE) is one property listing.
- Each named, individually bookable boat or charter vessel is one boat listing.
- Variants that are only priced differently (half-day vs full-day of the same boat) are NOT separate listings — they are trips on the one boat.
- Generic landing-page blurbs ("our amazing villas!") with no named unit are NOT a listing.

Classification rule per listing:
- If the unit is a place to stay (villa, apartment, cottage, house, hotel room, guesthouse, banda, penthouse) → listing_type = "property".
- If the unit is a boat or charter vessel (fishing charter, sport fisher, catamaran, dhow, yacht) → listing_type = "boat".
- When ambiguous, prefer "property".

Extraction rules:
- Only use information that actually appears in the briefs. Never invent.
- If a field is unknown, use null (scalar) or [] (array).
- "name" is the listing's own name, cleaned of site suffixes. Each listing's name must be unique within your output.
- "description" is 2–4 paragraphs of that listing's own description, joined by \\n\\n.
- "source_url" is the specific page where the listing was described (pick the most specific one among the briefs). If it only appears on the homepage, use the homepage URL.
- "price_per_night" / "currency": number + ISO code. Use "KES" as fallback ONLY when genuinely unstated.
- For properties, choose "property_type" from: ${PROPERTY_TYPES.join(', ')}.
- For boats, choose "boat_type" from: ${BOAT_TYPES.join(', ')}.
- For boats, "trips" is the list of offered packages with durations and prices. "trip_type" must be one of: ${TRIP_TYPES.join(', ')}. "target_species"/"fishing_techniques" should be short normalised strings (e.g. "Marlin", "Trolling").
- "amenities" are short lowercase labels (e.g. "wifi", "pool", "air conditioning"). Max 40.
- "house_rules" are short plain-English lines.
- "check_in_time"/"check_out_time" are HH:MM 24h strings or null.
- "cancellation_policy" is one of: ${CANCELLATION_POLICIES.join(', ')}, or null if unclear.
- "images" is the list of https image URLs that clearly depict THIS listing (skip site logos, icons, avatars). Only include images you saw in an IMAGES section of one of the briefs. Max 12 per listing.
- Always return valid JSON matching the schema exactly. Return an empty "listings" array if no distinct listings are identifiable.`;
}

const LLM_RESPONSE_SCHEMA = {
  name: 'MultiListingExtraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['listings'],
    properties: {
      listings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'listing_type',
            'source_url',
            'name',
            'description',
            'images',
            'property_type',
            'address',
            'city',
            'latitude',
            'longitude',
            'price_per_night',
            'currency',
            'max_guests',
            'bedrooms',
            'bathrooms',
            'beds',
            'amenities',
            'house_rules',
            'check_in_time',
            'check_out_time',
            'min_nights',
            'max_nights',
            'cleaning_fee',
            'security_deposit',
            'cancellation_policy',
            'rating',
            'review_count',
            'boat_type',
            'length_ft',
            'capacity',
            'crew_size',
            'captain_name',
            'captain_bio',
            'captain_experience_years',
            'target_species',
            'fishing_techniques',
            'trips',
            'departure_point',
          ],
          properties: {
            listing_type: { type: 'string', enum: ['property', 'boat'] },
            source_url: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            images: { type: 'array', items: { type: 'string' }, maxItems: 12 },
            // property fields
            property_type: { type: ['string', 'null'], enum: [...PROPERTY_TYPES, null] },
            address: { type: ['string', 'null'] },
            city: { type: ['string', 'null'] },
            latitude: { type: ['number', 'null'] },
            longitude: { type: ['number', 'null'] },
            price_per_night: { type: ['number', 'null'] },
            currency: { type: ['string', 'null'] },
            max_guests: { type: ['integer', 'null'] },
            bedrooms: { type: ['integer', 'null'] },
            bathrooms: { type: ['integer', 'null'] },
            beds: { type: ['integer', 'null'] },
            amenities: { type: 'array', items: { type: 'string' } },
            house_rules: { type: 'array', items: { type: 'string' } },
            check_in_time: { type: ['string', 'null'] },
            check_out_time: { type: ['string', 'null'] },
            min_nights: { type: ['integer', 'null'] },
            max_nights: { type: ['integer', 'null'] },
            cleaning_fee: { type: ['number', 'null'] },
            security_deposit: { type: ['number', 'null'] },
            cancellation_policy: { type: ['string', 'null'], enum: [...CANCELLATION_POLICIES, null] },
            rating: { type: ['number', 'null'] },
            review_count: { type: ['integer', 'null'] },
            // boat fields
            boat_type: { type: ['string', 'null'], enum: [...BOAT_TYPES, null] },
            length_ft: { type: ['integer', 'null'] },
            capacity: { type: ['integer', 'null'] },
            crew_size: { type: ['integer', 'null'] },
            captain_name: { type: ['string', 'null'] },
            captain_bio: { type: ['string', 'null'] },
            captain_experience_years: { type: ['integer', 'null'] },
            target_species: { type: 'array', items: { type: 'string' } },
            fishing_techniques: { type: 'array', items: { type: 'string' } },
            trips: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'duration_hours', 'price_total', 'price_per_person', 'trip_type', 'departure_time', 'description', 'includes', 'target_species'],
                properties: {
                  name: { type: 'string' },
                  duration_hours: { type: ['number', 'null'] },
                  price_total: { type: ['number', 'null'] },
                  price_per_person: { type: ['number', 'null'] },
                  trip_type: { type: 'string', enum: TRIP_TYPES },
                  departure_time: { type: ['string', 'null'] },
                  description: { type: 'string' },
                  includes: { type: 'array', items: { type: 'string' } },
                  target_species: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            departure_point: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

async function extractListingsWithLLM(
  combinedBrief: string,
  brandContext?: { brandName: string; placeName: string }
): Promise<any[]> {
  const apiKey = process.env.WATAMU_AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI import is not configured on the server (missing WATAMU_AI_API_KEY).');
  }
  const model = process.env.WATAMU_AI_MODEL || 'gpt-4o';
  const provider = (process.env.WATAMU_AI_PROVIDER || 'openai').toLowerCase();
  if (provider !== 'openai') {
    throw new Error(`Unsupported WATAMU_AI_PROVIDER: ${provider}`);
  }
  const { brandName = 'Watamu Bookings', placeName = 'Watamu' } = brandContext ?? {};

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: LLM_RESPONSE_SCHEMA,
        },
        messages: [
          { role: 'system', content: buildSystemPrompt(brandName, placeName) },
          {
            role: 'user',
            content: `Identify every distinct bookable listing across these page briefs. The briefs come from the same website.\n\n${combinedBrief}`,
          },
        ],
      }),
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('LLM response was empty or malformed.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('LLM returned invalid JSON.');
  }

  return Array.isArray(parsed?.listings) ? parsed.listings : [];
}

// ---------------------------------------------------------------------------
// Post-processing — mirror the shape of /api/import/generic so the preview
// step and save step can reuse the same code paths.
// ---------------------------------------------------------------------------

function toFiniteNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function toFiniteInt(v: any): number | null {
  const n = toFiniteNumber(v);
  return n === null ? null : Math.round(n);
}

function normaliseListing(
  raw: any,
  allScrapedImages: Set<string>,
  fallbackSourceUrl: string,
  placeName: string = 'Watamu'
): ImportedListing | null {
  const listingType: 'property' | 'boat' = raw?.listing_type === 'boat' ? 'boat' : 'property';

  const name = String(raw?.name || '').trim();
  if (!name) return null;
  const description = String(raw?.description || '').trim().slice(0, 8000);

  // Only keep LLM-proposed images that were actually in one of the scraped
  // pages' IMAGES sections — prevents hallucinated URLs leaking through.
  const llmImages: string[] = Array.isArray(raw?.images)
    ? raw.images
        .filter((s: any) => typeof s === 'string' && /^https:\/\//.test(s))
        .filter((s: string) => allScrapedImages.has(s))
    : [];
  const images = llmImages.slice(0, 12);

  const sourceUrl = typeof raw?.source_url === 'string' && /^https:\/\//.test(raw.source_url)
    ? raw.source_url
    : fallbackSourceUrl;

  if (listingType === 'boat') {
    const trips: ImportedTrip[] = Array.isArray(raw?.trips)
      ? raw.trips
          .filter((t: any) => t && typeof t.name === 'string' && t.name.trim())
          .slice(0, 10)
          .map((t: any) => ({
            name: String(t.name).trim().slice(0, 160),
            duration_hours: toFiniteNumber(t.duration_hours),
            price_total: toFiniteNumber(t.price_total),
            price_per_person: toFiniteNumber(t.price_per_person),
            trip_type: TRIP_TYPES.includes(t.trip_type) ? t.trip_type : 'half_day',
            departure_time: t.departure_time ? String(t.departure_time).slice(0, 16) : null,
            description: String(t.description || '').slice(0, 1000),
            includes: Array.isArray(t.includes) ? t.includes.slice(0, 20).map((x: any) => String(x).slice(0, 80)) : [],
            target_species: Array.isArray(t.target_species) ? t.target_species.slice(0, 10).map((x: any) => String(x).slice(0, 40)) : [],
          }))
      : [];

    const boat: ImportedBoat = {
      listing_type: 'boat',
      name,
      description,
      boat_type: raw?.boat_type && BOAT_TYPES.includes(raw.boat_type) ? raw.boat_type : 'sport_fisher',
      length_ft: toFiniteInt(raw?.length_ft),
      capacity: toFiniteInt(raw?.capacity),
      crew_size: toFiniteInt(raw?.crew_size),
      captain_name: raw?.captain_name ?? null,
      captain_bio: raw?.captain_bio ?? null,
      captain_experience_years: toFiniteInt(raw?.captain_experience_years),
      target_species: Array.isArray(raw?.target_species) ? raw.target_species.slice(0, 20).map((x: any) => String(x).slice(0, 40)) : [],
      fishing_techniques: Array.isArray(raw?.fishing_techniques) ? raw.fishing_techniques.slice(0, 20).map((x: any) => String(x).slice(0, 40)) : [],
      trips,
      departure_point: raw?.departure_point ?? null,
      images,
      rating: toFiniteNumber(raw?.rating),
      review_count: toFiniteInt(raw?.review_count),
      location: `${placeName}, Kenya`,
      source_url: sourceUrl,
      source: 'generic',
    };
    return boat;
  }

  const property: ImportedProperty = {
    listing_type: 'property',
    name,
    description,
    property_type: raw?.property_type && PROPERTY_TYPES.includes(raw.property_type) ? raw.property_type : 'house',
    address: raw?.address ?? '',
    city: raw?.city || placeName,
    latitude: toFiniteNumber(raw?.latitude),
    longitude: toFiniteNumber(raw?.longitude),
    price_per_night: toFiniteNumber(raw?.price_per_night),
    currency: (raw?.currency || 'KES').toString().toUpperCase().slice(0, 8),
    max_guests: toFiniteInt(raw?.max_guests),
    bedrooms: toFiniteInt(raw?.bedrooms),
    bathrooms: toFiniteInt(raw?.bathrooms),
    beds: toFiniteInt(raw?.beds),
    amenities: Array.isArray(raw?.amenities) ? raw.amenities.slice(0, 40).map((x: any) => String(x).slice(0, 60)) : [],
    house_rules: Array.isArray(raw?.house_rules) ? raw.house_rules.slice(0, 20).map((x: any) => String(x).slice(0, 140)) : [],
    check_in_time: raw?.check_in_time ?? null,
    check_out_time: raw?.check_out_time ?? null,
    min_nights: toFiniteInt(raw?.min_nights),
    max_nights: toFiniteInt(raw?.max_nights),
    cleaning_fee: toFiniteNumber(raw?.cleaning_fee),
    security_deposit: toFiniteNumber(raw?.security_deposit),
    cancellation_policy: raw?.cancellation_policy && CANCELLATION_POLICIES.includes(raw.cancellation_policy) ? raw.cancellation_policy : null,
    images,
    rating: toFiniteNumber(raw?.rating),
    review_count: toFiniteInt(raw?.review_count),
    source_url: sourceUrl,
    source: 'generic',
  };
  return property;
}

// Drop duplicate listings that the LLM might have double-counted from the
// homepage AND the detail page. Match on lowercased+collapsed name.
function dedupe(listings: ImportedListing[]): ImportedListing[] {
  const seen = new Set<string>();
  const out: ImportedListing[] = [];
  for (const l of listings) {
    const key = `${l.listing_type}:${l.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Route handler.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveImportUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { user } = auth;
    const supabase = await createServerClient();

    const body = await request.json();
    const cleanUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!sanitiseUrl(cleanUrl)) {
      return NextResponse.json(
        { error: 'Please paste a valid https:// URL (must be publicly reachable).' },
        { status: 400 }
      );
    }

    // 1. Entry page.
    const entry = await fetchSafe(cleanUrl);
    const entryBrief = buildPageBrief(entry.html, entry.finalUrl);

    // 2. Candidate sub-pages.
    const candidates = extractListingCandidateLinks(entry.html, entry.finalUrl, MAX_SUBPAGES)
      .filter((c) => c.url !== entry.finalUrl);

    // 3. Fetch each sub-page, collect briefs + images.
    const pageBriefs: string[] = [`# PAGE 1 (entry page)\n\n${entryBrief.brief}`];
    const allImages = new Set<string>(entryBrief.images);
    const fetchedUrls: string[] = [entry.finalUrl];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      try {
        const sub = await fetchSafe(c.url, { timeoutMs: SUBPAGE_TIMEOUT_MS });
        const subBrief = buildPageBrief(sub.html, sub.finalUrl);
        pageBriefs.push(`# PAGE ${i + 2} (sub-page: "${c.text}")\n\n${subBrief.brief}`);
        subBrief.images.forEach((img) => allImages.add(img));
        fetchedUrls.push(sub.finalUrl);
      } catch (e) {
        // Sub-page failures shouldn't abort discovery — just skip.
        console.warn(`[discover] sub-page fetch failed: ${c.url}`, e);
      }
    }

    const combinedBrief = pageBriefs.join('\n\n\n---\n\n\n').slice(0, 180_000);

    if (combinedBrief.length < 400) {
      return NextResponse.json(
        { error: 'That page has almost no readable content. It may be JavaScript-only or require login.' },
        { status: 400 }
      );
    }

    const { place, host } = await getCurrentPlace();
    const brandContext = {
      brandName: host.brand_name,
      placeName: place?.name ?? host.brand_short,
    };

    // 4. LLM extraction.
    const rawListings = await extractListingsWithLLM(combinedBrief, brandContext);

    // 5. Normalise + dedupe.
    const listings = dedupe(
      rawListings
        .map((r) => normaliseListing(r, allImages, entry.finalUrl, brandContext.placeName))
        .filter((l): l is ImportedListing => l !== null)
    );

    // Log the discovery (best-effort — failure to log shouldn't fail the request).
    try {
      await supabase.from('wb_import_logs').insert({
        owner_id: user.id,
        source: 'generic',
        source_url: cleanUrl,
        listing_type: listings.length === 1 ? listings[0].listing_type : 'property',
        status: 'completed',
        imported_data: { discovery: true, fetched_urls: fetchedUrls, listings } as any,
      });
    } catch (e) {
      console.warn('[discover] wb_import_logs insert failed', e);
    }

    return NextResponse.json({
      listings,
      fetched_urls: fetchedUrls,
    });
  } catch (err: any) {
    console.error('Discover import error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to discover listings from that URL' },
      { status: 500 }
    );
  }
}
