import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/import/generic
 *
 * Generic "paste any URL" importer. Takes any public https URL, fetches the
 * page, and extracts listing data from OpenGraph / JSON-LD / meta tags. Used
 * when the URL isn't one of the specifically-supported platforms (Airbnb,
 * FishingBooker, Booking.com) — e.g. Vrbo, personal Wix/Squarespace/WordPress
 * sites, or bespoke hotel microsites.
 *
 * Also heuristically detects whether the page describes a property rental or
 * a fishing / boat charter so the import flow can pipe it to the right draft.
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
  amenities: string[];
  images: string[];
  rating: number | null;
  review_count: number | null;
  source_url: string;
  source: 'generic';
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
  target_species: string[];
  fishing_techniques: string[];
  trips: any[];
  images: string[];
  rating: number | null;
  review_count: number | null;
  source_url: string;
  source: 'generic';
}

// ---------------------------------------------------------------------------
// SSRF guard.
//
// The generic importer accepts arbitrary user-supplied URLs, so we have to
// block:
//   - non-https (http would allow local plaintext endpoints; file:// / gopher://
//     obvious-no)
//   - private / loopback / link-local / IPv6 unique-local ranges (cloud
//     metadata, RFC1918, 127.0.0.0/8, 169.254.169.254, etc.)
//   - hosts that resolve to nothing
// We do a cheap syntactic check here; the fetch layer enforces no redirects
// to disallowed hosts via a manual redirect walk.
// ---------------------------------------------------------------------------
const PRIVATE_IP_RANGES: RegExp[] = [
  /^10\./,                                                                    // 10.0.0.0/8
  /^127\./,                                                                   // 127.0.0.0/8  loopback
  /^169\.254\./,                                                              // 169.254.0.0/16  link-local (AWS metadata!)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,                                           // 172.16.0.0/12
  /^192\.168\./,                                                              // 192.168.0.0/16
  /^0\./,                                                                     // 0.0.0.0/8
  /^224\./, /^225\./, /^226\./, /^227\./, /^228\./, /^229\./,                 // multicast
  /^230\./, /^231\./, /^232\./, /^233\./, /^234\./, /^235\./,
  /^236\./, /^237\./, /^238\./, /^239\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,                          // 100.64.0.0/10  CGNAT
];

function isPrivateOrBlockedIp(host: string): boolean {
  // IPv6 loopback / private / unique-local / link-local.
  if (host === '::1' || host === '[::1]') return true;
  if (/^\[?(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
  if (/^\[?fe80:/i.test(host)) return true;
  if (/^\[?::ffff:/i.test(host)) return true; // IPv4-mapped IPv6

  // IPv4 literals.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return PRIVATE_IP_RANGES.some((re) => re.test(host));
  }
  // localhost by name.
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host)) return true;

  return false;
}

function sanitiseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    if (isPrivateOrBlockedIp(u.hostname)) return null;
    // Strip credentials.
    u.username = '';
    u.password = '';
    return u;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML helpers.
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

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function extractMeta(html: string, name: string): string | null {
  const propMatch = html.match(new RegExp(`property="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+property="${name}"`, 'i'));
  if (propMatch) return decodeEntities(propMatch[1]);
  const nameMatch = html.match(new RegExp(`name="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+name="${name}"`, 'i'));
  return nameMatch ? decodeEntities(nameMatch[1]) : null;
}

// Collect every JSON-LD block on the page and return the one that best
// resembles a listing. Falls back to the first one that has a useful name.
function pickBestJsonLd(html: string): any | null {
  const blocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  const candidates: any[] = [];
  for (const m of blocks) {
    try {
      const parsed = JSON.parse(m[1]);
      // A @graph entry lifts many sites' LD blocks into an array of nested objects.
      if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
        candidates.push(...parsed['@graph']);
      } else {
        candidates.push(parsed);
      }
    } catch {
      // Some sites wrap ld+json in CDATA or include trailing commas — skip.
    }
  }

  const listingTypes = new Set([
    'Hotel', 'LodgingBusiness', 'Resort', 'BedAndBreakfast', 'Apartment', 'House',
    'Accommodation', 'Campground', 'TouristAttraction', 'VacationRental',
    'Product', 'Service', 'Offer', 'TravelAction', 'Motel', 'Hostel',
  ]);

  let best: any = null;
  for (const c of candidates) {
    if (!c) continue;
    const type = c['@type'];
    const typeStr = Array.isArray(type) ? type.join(',') : String(type || '');
    const typeList = typeStr.split(/[,\s]+/).filter(Boolean);
    const isListing = typeList.some((t) => listingTypes.has(t));
    if (isListing) { best = c; break; }
    if (!best && c.name && !/^(BreadcrumbList|Organization|WebSite|WebPage|ImageObject|SearchAction)$/.test(typeStr)) {
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Heuristic property-type / boat detection.
// ---------------------------------------------------------------------------

const BOAT_SIGNALS = [
  'charter', 'fishing', 'marlin', 'sailfish', 'tuna', 'dorado', 'trolling',
  'sport fisher', 'sportfisher', 'boat hire', 'deep sea', 'dhow', 'catamaran',
  'captain', 'skipper', 'reel', 'rod', 'knots', 'outboard', 'offshore', 'yacht',
  'marine park trip',
];

function classifyListing(text: string, url: string): 'property' | 'boat' {
  const blob = (text + ' ' + url).toLowerCase();
  let boatScore = 0;
  for (const s of BOAT_SIGNALS) {
    if (blob.includes(s)) boatScore += 1;
  }
  // Need at least two boat-ish signals before we classify as a boat, otherwise
  // default to property. Keeps false positives on "Captain's Cottage" villas etc. low.
  return boatScore >= 2 ? 'boat' : 'property';
}

function detectPropertyType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('villa')) return 'villa';
  if (t.includes('apartment') || t.includes('flat') || t.includes('condo')) return 'apartment';
  if (t.includes('cottage')) return 'cottage';
  if (t.includes('penthouse')) return 'penthouse';
  if (t.includes('banda')) return 'banda';
  if (t.includes('guesthouse') || t.includes('guest house') || t.includes('bed and breakfast') || t.includes('b&b')) return 'guesthouse';
  if (t.includes('hotel') || t.includes('resort') || t.includes('lodge')) return 'hotel';
  return 'house';
}

function detectBoatType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('sport fisher') || t.includes('sportfisher') || t.includes('sport fishing')) return 'sport_fisher';
  if (t.includes('catamaran')) return 'catamaran';
  if (t.includes('dhow')) return 'dhow';
  if (t.includes('yacht')) return 'yacht';
  if (t.includes('sailboat') || t.includes('sailing')) return 'sailboat';
  if (t.includes('speedboat') || t.includes('center console') || t.includes('centre console')) return 'speedboat';
  return 'sport_fisher';
}

const TARGET_SPECIES = [
  'marlin', 'sailfish', 'tuna', 'dorado', 'wahoo', 'kingfish', 'barracuda',
  'trevally', 'yellowfin', 'giant trevally', 'dogtooth tuna', 'mahi mahi',
];
const FISHING_TECHNIQUES = [
  'trolling', 'jigging', 'bottom fishing', 'popping', 'fly fishing', 'chumming',
  'live baiting', 'deep dropping',
];

// ---------------------------------------------------------------------------
// Page fetch — with a manual redirect walk so SSRF guards apply to each hop.
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
// Main scrape.
// ---------------------------------------------------------------------------

async function scrapeGeneric(
  rawUrl: string,
  forcedListingType?: 'property' | 'boat'
): Promise<{ data: ImportedProperty | ImportedBoat; listing_type: 'property' | 'boat' }> {
  const { html, finalUrl } = await fetchSafe(rawUrl);

  const jsonLd = pickBestJsonLd(html);

  const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
  const ogDescription = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogImage = extractMeta(html, 'og:image');

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  let name = (ogTitle || pageTitle || '').replace(/\s*\|\s*[^|]+$/, '').trim();
  let description = (ogDescription || '').trim();

  if (jsonLd) {
    if (jsonLd.name && !name) name = String(jsonLd.name);
    if (jsonLd.description && !description) description = stripTags(String(jsonLd.description));
  }

  // Pull the first chunk of visible <p> text as a last-resort description.
  if (!description) {
    const paragraphs: string[] = [];
    const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g);
    for (const m of pMatches) {
      const txt = stripTags(m[1]);
      if (txt.length > 60) paragraphs.push(txt);
      if (paragraphs.join(' ').length > 800) break;
    }
    description = paragraphs.join('\n\n').slice(0, 2000);
  }

  // -------------------- images --------------------
  const images: string[] = [];
  const pushImage = (raw: string) => {
    let u = raw.trim().replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    try {
      const abs = new URL(u, finalUrl).toString();
      if (!/^https:\/\//.test(abs)) return;
      if (/\.(svg|ico)(\?|$)/i.test(abs)) return;
      if (/sprite|icon|logo|favicon/i.test(abs)) return;
      if (!images.includes(abs)) images.push(abs);
    } catch {}
  };

  if (ogImage) pushImage(ogImage);
  for (const m of html.matchAll(/property="og:image(?::url)?"\s+content="([^"]+)"/g)) pushImage(m[1]);
  for (const m of html.matchAll(/property="og:image:secure_url"\s+content="([^"]+)"/g)) pushImage(m[1]);

  // Images from JSON-LD (.image: string | string[] | ImageObject | ImageObject[])
  if (jsonLd?.image) {
    const imgs = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
    for (const img of imgs) {
      if (typeof img === 'string') pushImage(img);
      else if (img?.url) pushImage(String(img.url));
      else if (img?.contentUrl) pushImage(String(img.contentUrl));
    }
  }

  // <img src="..."> as a fallback — keep the first 15 reasonable-looking ones.
  if (images.length < 10) {
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      pushImage(m[1]);
      if (images.length >= 20) break;
    }
  }

  // -------------------- price / currency / rating --------------------
  let pricePerNight: number | null = null;
  let currency = 'KES';
  let rating: number | null = null;
  let reviewCount: number | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let address = '';
  let city = 'Watamu';

  if (jsonLd) {
    if (jsonLd.address) {
      if (typeof jsonLd.address === 'string') {
        address = jsonLd.address;
      } else {
        address = [jsonLd.address.streetAddress, jsonLd.address.postalCode].filter(Boolean).join(', ');
        if (jsonLd.address.addressLocality) city = jsonLd.address.addressLocality;
      }
    }
    if (jsonLd.geo) {
      latitude = parseFloat(jsonLd.geo.latitude) || null;
      longitude = parseFloat(jsonLd.geo.longitude) || null;
    }
    if (jsonLd.aggregateRating) {
      rating = parseFloat(jsonLd.aggregateRating.ratingValue) || null;
      reviewCount = parseInt(jsonLd.aggregateRating.reviewCount || jsonLd.aggregateRating.ratingCount) || null;
    }
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offer?.price) {
      pricePerNight = parseFloat(String(offer.price));
      if (offer.priceCurrency) currency = offer.priceCurrency;
    } else if (jsonLd.priceRange) {
      const pm = String(jsonLd.priceRange).match(/([A-Z]{3})?\s*([\d,]+(?:\.\d+)?)/);
      if (pm) {
        pricePerNight = parseFloat(pm[2].replace(/,/g, ''));
        if (pm[1]) currency = pm[1];
      }
    }
  }

  // -------------------- classification --------------------
  const listingType: 'property' | 'boat' =
    forcedListingType || classifyListing(`${name} ${description}`, finalUrl);

  // Final validation.
  if (!name || /^(404|Not Found|Page Not Found|Access Denied)$/i.test(name)) {
    throw new Error(
      'Could not extract enough information from that page. It may be JavaScript-only or require login. Try pasting the listing URL from Airbnb, Booking.com, or FishingBooker instead.'
    );
  }

  if (listingType === 'boat') {
    const blob = `${name} ${description}`.toLowerCase();
    const detectedSpecies = TARGET_SPECIES.filter((s) => blob.includes(s));
    const detectedTechniques = FISHING_TECHNIQUES.filter((tq) => blob.includes(tq));

    const capacityMatch = blob.match(/(\d+)\s*(?:pax|guest|angler|people)/);
    const lengthMatch = blob.match(/(\d+)\s*(?:ft|foot|feet|m\b)/);
    const crewMatch = blob.match(/(\d+)\s*crew/);

    const boat: ImportedBoat = {
      name,
      description: description.slice(0, 5000),
      boat_type: detectBoatType(blob),
      length_ft: lengthMatch ? parseInt(lengthMatch[1], 10) : null,
      capacity: capacityMatch ? parseInt(capacityMatch[1], 10) : null,
      crew_size: crewMatch ? parseInt(crewMatch[1], 10) : null,
      captain_name: null,
      captain_bio: null,
      target_species: detectedSpecies,
      fishing_techniques: detectedTechniques,
      trips: [],
      images: images.slice(0, 20),
      rating,
      review_count: reviewCount,
      source_url: finalUrl,
      source: 'generic',
    };
    return { data: boat, listing_type: 'boat' };
  }

  // -------------------- property shape --------------------
  const blob = `${name} ${description}`.toLowerCase();
  const guestMatch = blob.match(/(\d+)\s*(?:guest|sleeps|people)/);
  const bedroomMatch = blob.match(/(\d+)\s*bedroom/);
  const bathroomMatch = blob.match(/(\d+)\s*bathroom/);

  const property: ImportedProperty = {
    name,
    description: description.slice(0, 5000),
    property_type: detectPropertyType(blob),
    address,
    city,
    latitude,
    longitude,
    price_per_night: pricePerNight,
    currency,
    max_guests: guestMatch ? parseInt(guestMatch[1], 10) : null,
    bedrooms: bedroomMatch ? parseInt(bedroomMatch[1], 10) : null,
    bathrooms: bathroomMatch ? parseInt(bathroomMatch[1], 10) : null,
    amenities: [],
    images: images.slice(0, 20),
    rating,
    review_count: reviewCount,
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
