import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/import/generic
 *
 * Generic "paste any URL" importer powered by an LLM (OpenAI by default).
 * Fetches the target page, strips it down to a structured brief (title, meta,
 * JSON-LD blocks, image URLs, body text), then asks the LLM for the canonical
 * listing fields using a strict JSON schema.
 *
 * Used for:
 *   - Vrbo / personal Wix / Squarespace / WordPress sites / bespoke hotel
 *     microsites / small charter-boat websites.
 *   - Any URL NOT handled by /api/import/airbnb, /api/import/booking-com,
 *     /api/import/fishingbooker — those dedicated scrapers are faster, cheaper,
 *     and more reliable and should always be preferred when the host matches.
 *
 * Env vars (set on Vercel):
 *   WATAMU_AI_API_KEY   (required)  – OpenAI API key
 *   WATAMU_AI_PROVIDER  (optional)  – "openai" (default). Reserved.
 *   WATAMU_AI_MODEL     (optional)  – defaults to "gpt-4o".
 *
 * Body: { url: string, listing_type?: 'property' | 'boat' }
 * Returns: { data: ImportedProperty | ImportedBoat, listing_type: 'property' | 'boat' }
 */

interface ImportedProperty {
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

// ---------------------------------------------------------------------------
// SSRF guard — private IP blocklist + manual redirect walk so every hop is
// re-checked. Blocks cloud metadata endpoints (169.254.169.254), RFC1918,
// CGNAT (100.64/10), loopback, link-local, IPv6 ULA (fc00::/7) and IPv6
// link-local (fe80::/10).
// ---------------------------------------------------------------------------
const PRIVATE_IP_RANGES: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^224\./, /^225\./, /^226\./, /^227\./, /^228\./, /^229\./,
  /^230\./, /^231\./, /^232\./, /^233\./, /^234\./, /^235\./,
  /^236\./, /^237\./, /^238\./, /^239\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
];

function isPrivateOrBlockedIp(host: string): boolean {
  if (host === '::1' || host === '[::1]') return true;
  if (/^\[?(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
  if (/^\[?fe80:/i.test(host)) return true;
  if (/^\[?::ffff:/i.test(host)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return PRIVATE_IP_RANGES.some((re) => re.test(host));
  }
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host)) return true;
  return false;
}

function sanitiseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    if (isPrivateOrBlockedIp(u.hostname)) return null;
    u.username = '';
    u.password = '';
    return u;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page fetch with manual redirect walk.
// ---------------------------------------------------------------------------

async function fetchSafe(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let current = sanitiseUrl(rawUrl);
  if (!current) throw new Error('URL rejected (must be https and a public host)');

  for (let hop = 0; hop < 5; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } finally {
      clearTimeout(t);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without Location header from ${current.toString()}`);
      const next = sanitiseUrl(new URL(loc, current).toString());
      if (!next) throw new Error('Redirect to a disallowed host');
      current = next;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch page: ${res.status}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) {
      throw new Error(`Page returned ${ct || 'unknown content type'} — not an HTML listing page`);
    }

    const html = await res.text();
    return { html, finalUrl: current.toString() };
  }

  throw new Error('Too many redirects');
}

// ---------------------------------------------------------------------------
// HTML → structured brief.
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function buildPageBrief(html: string, finalUrl: string): { brief: string; images: string[] } {
  // Strip <script>, <style>, <noscript>, HTML comments.
  const denuded = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Title.
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  // All meta tags worth considering.
  const metaLines: string[] = [];
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    if (/(property|name)="(og:|twitter:|description$|keywords$|author$|geo|article:|og\.)/.test(tag)) {
      metaLines.push(decodeEntities(tag).slice(0, 400));
    }
  }

  // Image URLs (og:image + <img>).
  const imageSet = new Set<string>();
  const pushImage = (raw: string | undefined | null) => {
    if (!raw) return;
    let u = raw.trim().replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    try {
      const abs = new URL(u, finalUrl).toString();
      if (!/^https:\/\//.test(abs)) return;
      if (/\.(svg|ico)(\?|$)/i.test(abs)) return;
      if (/(sprite|icon|logo|favicon|avatar|spinner|tracking|beacon|pixel)/i.test(abs)) return;
      imageSet.add(abs);
    } catch {}
  };
  for (const m of html.matchAll(/property="og:image(?::url|:secure_url)?"\s+content="([^"]+)"/g)) pushImage(m[1]);
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) pushImage(m[1]);
  for (const m of html.matchAll(/<img[^>]+data-src="([^"]+)"/gi)) pushImage(m[1]);
  for (const m of html.matchAll(/<img[^>]+srcset="([^"]+)"/gi)) {
    const first = m[1].split(',')[0]?.trim().split(/\s+/)[0];
    pushImage(first);
  }
  const images = Array.from(imageSet).slice(0, 40);

  // JSON-LD — keep each block intact (information-dense).
  const jsonLdBlocks: string[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    jsonLdBlocks.push(m[1].trim().slice(0, 8_000));
    if (jsonLdBlocks.length >= 6) break;
  }

  // Visible body text: strip tags, collapse whitespace.
  const bodyText = decodeEntities(denuded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

  const parts: string[] = [];
  parts.push(`# URL\n${finalUrl}`);
  if (title) parts.push(`# TITLE\n${title}`);
  if (metaLines.length) parts.push(`# META\n${metaLines.slice(0, 40).join('\n')}`);
  if (jsonLdBlocks.length) parts.push(`# JSON-LD\n${jsonLdBlocks.join('\n---\n')}`);
  if (images.length) parts.push(`# IMAGES\n${images.slice(0, 40).join('\n')}`);
  parts.push(`# BODY TEXT (truncated)\n${bodyText.slice(0, 20_000)}`);

  return { brief: parts.join('\n\n').slice(0, 60_000), images };
}

// ---------------------------------------------------------------------------
// Taxonomies enforced on the LLM via the JSON schema.
// ---------------------------------------------------------------------------
const PROPERTY_TYPES = ['villa', 'apartment', 'cottage', 'house', 'hotel', 'guesthouse', 'banda', 'penthouse'];
const BOAT_TYPES = ['sport_fisher', 'catamaran', 'dhow', 'yacht', 'sailboat', 'speedboat'];
const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict', 'non_refundable'];
const TRIP_TYPES = ['half_day', 'half_day_morning', 'half_day_afternoon', 'full_day', 'overnight', 'multi_day', 'sunset_cruise'];

// ---------------------------------------------------------------------------
// LLM call — OpenAI Chat Completions with JSON Schema response format.
// ---------------------------------------------------------------------------

const LLM_SYSTEM_PROMPT = `You are a data-extraction assistant for Watamu Bookings, a property and boat-charter booking marketplace in Watamu, Kenya.

You will receive a condensed brief of a webpage (title, meta tags, JSON-LD blocks, image URLs, and body text) representing a rental listing or boat charter. Your job is to extract the canonical listing data as JSON.

Classification rule:
- If the page describes a place to stay (villa, apartment, cottage, house, hotel, guesthouse, banda, penthouse) → listing_type = "property".
- If the page describes a boat charter or fishing trip (fishing charter, sport fisher, catamaran tour, dhow cruise, yacht hire) → listing_type = "boat".
- When ambiguous, prefer "property".

Extraction rules:
- Only use information that actually appears in the brief. Never invent.
- If a field is unknown or not present, use null (for scalars) or [] (for arrays).
- "name" must be the listing's human-facing title, cleaned of site suffixes like " | Airbnb", " - Updated 2025", " - Vrbo".
- "description" is 2–5 paragraphs of the listing's own description, verbatim where possible, joined by \\n\\n. Do not add marketing hype that isn't on the page.
- "price_per_night" is a number in the listing's currency; "currency" is a 3-letter ISO code. Use "KES" as fallback ONLY when the currency is genuinely unstated.
- For properties, choose "property_type" from: ${PROPERTY_TYPES.join(', ')}.
- For boats, choose "boat_type" from: ${BOAT_TYPES.join(', ')}.
- For boats, "trips" is the list of offered packages with their durations and prices. "trip_type" must be one of: ${TRIP_TYPES.join(', ')}. "target_species" and "fishing_techniques" should be short normalised strings (e.g. "Marlin", "Trolling").
- "amenities" are short lowercase labels (e.g. "wifi", "pool", "air conditioning", "kitchen"). Maximum 40.
- "house_rules" are short plain-English lines (e.g. "No smoking", "No parties").
- "check_in_time" and "check_out_time" are HH:MM 24h strings or null.
- "cancellation_policy" is one of: ${CANCELLATION_POLICIES.join(', ')}, or null if unclear.
- "images" is the list of full https URLs from the IMAGES section pointing to the actual listing (skip logos, avatars, icons). Maximum 25.
- Always return valid JSON matching the schema exactly.`;

// JSON schema with discriminator = listing_type.
const LLM_RESPONSE_SCHEMA = {
  name: 'ListingExtraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'listing_type',
      'name',
      'description',
      'images',
      // property-only
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
      // boat-only
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
      name: { type: 'string' },
      description: { type: 'string' },
      images: { type: 'array', items: { type: 'string' }, maxItems: 25 },
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
};

async function extractWithLLM(
  brief: string,
  forcedListingType?: 'property' | 'boat'
): Promise<any> {
  const apiKey = process.env.WATAMU_AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI import is not configured on the server (missing WATAMU_AI_API_KEY).');
  }
  const model = process.env.WATAMU_AI_MODEL || 'gpt-4o';
  const provider = (process.env.WATAMU_AI_PROVIDER || 'openai').toLowerCase();
  if (provider !== 'openai') {
    throw new Error(`Unsupported WATAMU_AI_PROVIDER: ${provider}`);
  }

  const userPrompt = forcedListingType
    ? `The user has hinted that this is a ${forcedListingType} listing. Use that as the listing_type unless the brief is flatly inconsistent with it.\n\nBrief:\n\n${brief}`
    : `Extract the listing data from this brief.\n\nBrief:\n\n${brief}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
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
          { role: 'system', content: LLM_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
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

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('LLM returned invalid JSON.');
  }
}

// ---------------------------------------------------------------------------
// Main pipeline.
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

async function scrapeGeneric(
  rawUrl: string,
  forcedListingType?: 'property' | 'boat'
): Promise<{ data: ImportedProperty | ImportedBoat; listing_type: 'property' | 'boat' }> {
  const { html, finalUrl } = await fetchSafe(rawUrl);

  const { brief, images: scrapedImages } = buildPageBrief(html, finalUrl);

  // Bail early if the page has basically nothing usable — saves an LLM call.
  if (brief.length < 400) {
    throw new Error(
      'That page has almost no readable content. It may be JavaScript-only or require login. Try pasting an Airbnb, Booking.com, or FishingBooker URL instead.'
    );
  }

  const extracted = await extractWithLLM(brief, forcedListingType);

  const listingType: 'property' | 'boat' =
    extracted.listing_type === 'boat' ? 'boat' : 'property';

  // Prefer the LLM's curated images; fall back to the scraped list if the
  // model was conservative or picked nothing valid.
  const llmImages: string[] = Array.isArray(extracted.images)
    ? extracted.images.filter((s: any) => typeof s === 'string' && /^https:\/\//.test(s))
    : [];
  const images = (llmImages.length > 0 ? llmImages : scrapedImages).slice(0, 25);

  const name = String(extracted.name || '').trim();
  if (!name || /^(404|Not Found|Page Not Found|Access Denied)$/i.test(name)) {
    throw new Error(
      'Could not extract a listing name from that page. It may be JavaScript-only or require login.'
    );
  }
  const description = String(extracted.description || '').trim().slice(0, 8000);

  if (listingType === 'boat') {
    const trips: ImportedTrip[] = Array.isArray(extracted.trips)
      ? extracted.trips
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
      name,
      description,
      boat_type: (extracted.boat_type && BOAT_TYPES.includes(extracted.boat_type)) ? extracted.boat_type : 'sport_fisher',
      length_ft: toFiniteInt(extracted.length_ft),
      capacity: toFiniteInt(extracted.capacity),
      crew_size: toFiniteInt(extracted.crew_size),
      captain_name: extracted.captain_name ?? null,
      captain_bio: extracted.captain_bio ?? null,
      captain_experience_years: toFiniteInt(extracted.captain_experience_years),
      target_species: Array.isArray(extracted.target_species) ? extracted.target_species.slice(0, 20).map((x: any) => String(x).slice(0, 40)) : [],
      fishing_techniques: Array.isArray(extracted.fishing_techniques) ? extracted.fishing_techniques.slice(0, 20).map((x: any) => String(x).slice(0, 40)) : [],
      trips,
      departure_point: extracted.departure_point ?? null,
      images,
      rating: toFiniteNumber(extracted.rating),
      review_count: toFiniteInt(extracted.review_count),
      location: 'Watamu, Kenya',
      source_url: finalUrl,
      source: 'generic',
    };
    return { data: boat, listing_type: 'boat' };
  }

  const property: ImportedProperty = {
    name,
    description,
    property_type: (extracted.property_type && PROPERTY_TYPES.includes(extracted.property_type)) ? extracted.property_type : 'house',
    address: extracted.address ?? '',
    city: extracted.city || 'Watamu',
    latitude: toFiniteNumber(extracted.latitude),
    longitude: toFiniteNumber(extracted.longitude),
    price_per_night: toFiniteNumber(extracted.price_per_night),
    currency: (extracted.currency || 'KES').toString().toUpperCase().slice(0, 8),
    max_guests: toFiniteInt(extracted.max_guests),
    bedrooms: toFiniteInt(extracted.bedrooms),
    bathrooms: toFiniteInt(extracted.bathrooms),
    beds: toFiniteInt(extracted.beds),
    amenities: Array.isArray(extracted.amenities) ? extracted.amenities.slice(0, 40).map((x: any) => String(x).slice(0, 60)) : [],
    house_rules: Array.isArray(extracted.house_rules) ? extracted.house_rules.slice(0, 20).map((x: any) => String(x).slice(0, 140)) : [],
    check_in_time: extracted.check_in_time ?? null,
    check_out_time: extracted.check_out_time ?? null,
    min_nights: toFiniteInt(extracted.min_nights),
    max_nights: toFiniteInt(extracted.max_nights),
    cleaning_fee: toFiniteNumber(extracted.cleaning_fee),
    security_deposit: toFiniteNumber(extracted.security_deposit),
    cancellation_policy: (extracted.cancellation_policy && CANCELLATION_POLICIES.includes(extracted.cancellation_policy)) ? extracted.cancellation_policy : null,
    images,
    rating: toFiniteNumber(extracted.rating),
    review_count: toFiniteInt(extracted.review_count),
    source_url: finalUrl,
    source: 'generic',
  };
  return { data: property, listing_type: 'property' };
}

// ---------------------------------------------------------------------------
// Route handler.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const cleanUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    const listingTypeHint: 'property' | 'boat' | undefined =
      body?.listing_type === 'boat' ? 'boat' : body?.listing_type === 'property' ? 'property' : undefined;

    if (!sanitiseUrl(cleanUrl)) {
      return NextResponse.json(
        { error: 'Please paste a valid https:// URL (must be publicly reachable).' },
        { status: 400 }
      );
    }

    const { data, listing_type } = await scrapeGeneric(cleanUrl, listingTypeHint);

    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: 'generic',
      source_url: cleanUrl,
      listing_type,
      status: 'completed',
      imported_data: data as any,
    });

    return NextResponse.json({ data, listing_type });
  } catch (err: any) {
    console.error('Generic import error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to import from that URL' },
      { status: 500 }
    );
  }
}
