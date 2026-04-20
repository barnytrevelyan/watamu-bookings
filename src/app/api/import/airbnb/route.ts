import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveImportUser } from '@/lib/import/auth';

/**
 * POST /api/import/airbnb
 *
 * Accepts an Airbnb listing URL, scrapes the listing data,
 * and returns a pre-filled property object for the owner to review.
 *
 * Body: { url: string }
 * Returns: { data: ImportedProperty } or { error: string }
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
  source: 'airbnb';
}

function extractAirbnbId(url: string): string | null {
  // Matches /rooms/12345 or /rooms/12345?...
  const match = url.match(/airbnb\.[a-z.]+\/rooms\/(\d+)/i);
  return match ? match[1] : null;
}

/**
 * SSRF guard — only allow https fetches to an airbnb.* host.
 * Without this, the user-supplied `url` goes straight to fetch() and can hit
 * internal metadata endpoints (e.g. 169.254.169.254) as long as the raw string
 * includes "airbnb".
 */
function isAllowedAirbnbUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return /(^|\.)airbnb\.[a-z.]+$/.test(host);
  } catch {
    return false;
  }
}

async function scrapeAirbnb(url: string): Promise<ImportedProperty> {
  if (!isAllowedAirbnbUrl(url)) {
    throw new Error('URL is not a valid Airbnb https URL');
  }

  // Fetch the page HTML with a 10s timeout so a hung response cannot block the function.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(t);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Airbnb listing: ${response.status}`);
  }

  const html = await response.text();

  // Airbnb serves a "helpful 404" page with HTTP 200 when a room ID doesn't exist.
  // Detect that here so we don't save a listing named "404 Page Not Found".
  if (/404 Page Not Found/i.test(html) && html.length < 10_000) {
    throw new Error('That Airbnb listing could not be found. Please check the URL.');
  }

  // Extract data from multiple sources in the HTML

  // 1. JSON-LD structured data. Airbnb pages often have multiple ld+json blocks
  // (BreadcrumbList, Organization, LodgingBusiness, …). Iterate them all and
  // prefer one whose @type looks like a listing, falling back to any block with a name.
  let jsonLd: any = null;
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const type = parsed['@type'];
      const isListingType = type === 'LodgingBusiness' || type === 'Product' || type === 'TouristAttraction' || type === 'Accommodation' || type === 'House' || type === 'Apartment';
      if (isListingType) { jsonLd = parsed; break; }
      if (!jsonLd && parsed && parsed.name && type !== 'BreadcrumbList' && type !== 'Organization') {
        jsonLd = parsed; // tentative; keep iterating in case a better match appears
      }
    } catch {}
  }

  // 2. __NEXT_DATA__ (data-deferred-state is HTML-entity encoded, not URL-encoded —
  // decodeURIComponent was wrong and its output was never read, so we drop it).
  let bootstrapData: any = null;
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      bootstrapData = JSON.parse(nextDataMatch[1]);
    } catch {}
  }
  void bootstrapData; // reserved for future deeper extraction

  // 3. Open Graph meta tags
  const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
  const ogDescription = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogImage = extractMeta(html, 'og:image');

  // 4. Extract title from <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(/\s*[-–|].*$/, '').trim() : '';

  // 5. Extract images from og:image and any other image meta tags
  const images: string[] = [];
  if (ogImage) images.push(ogImage);

  // Find additional images from meta tags
  const imageMatches = html.matchAll(/property="og:image(?::url)?"\s+content="([^"]+)"/g);
  for (const m of imageMatches) {
    if (!images.includes(m[1])) images.push(m[1]);
  }

  // Also try to find images in preloaded data
  const imgMatches = html.matchAll(/https:\/\/a0\.muscache\.com\/im\/pictures\/[^\s"']+/g);
  for (const m of imgMatches) {
    const cleanUrl = m[0].replace(/\\u002F/g, '/');
    if (!images.includes(cleanUrl) && images.length < 20) {
      images.push(cleanUrl);
    }
  }

  // 6. Try to extract structured listing data
  let name = ogTitle || pageTitle || '';
  let description = ogDescription || '';
  let pricePerNight: number | null = null;
  let currency = 'KES';
  let maxGuests: number | null = null;
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let rating: number | null = null;
  let reviewCount: number | null = null;
  let amenities: string[] = [];
  let address = '';
  let city = 'Watamu';
  let propertyType = 'house';

  // From JSON-LD
  if (jsonLd) {
    if (jsonLd.name) name = jsonLd.name;
    if (jsonLd.description) description = jsonLd.description;
    if (jsonLd.address) {
      address = typeof jsonLd.address === 'string'
        ? jsonLd.address
        : jsonLd.address.streetAddress || '';
      if (jsonLd.address.addressLocality) city = jsonLd.address.addressLocality;
    }
    if (jsonLd.geo) {
      latitude = parseFloat(jsonLd.geo.latitude) || null;
      longitude = parseFloat(jsonLd.geo.longitude) || null;
    }
    if (jsonLd.aggregateRating) {
      rating = parseFloat(jsonLd.aggregateRating.ratingValue) || null;
      reviewCount = parseInt(jsonLd.aggregateRating.reviewCount) || null;
    }
    if (jsonLd.offers?.priceSpecification?.price) {
      pricePerNight = parseFloat(jsonLd.offers.priceSpecification.price);
      currency = jsonLd.offers.priceSpecification.priceCurrency || 'KES';
    }
  }

  // Parse guest/bedroom/bathroom from description or title
  const guestMatch = (description + ' ' + name).match(/(\d+)\s*guest/i);
  const bedroomMatch = (description + ' ' + name).match(/(\d+)\s*bedroom/i);
  const bathroomMatch = (description + ' ' + name).match(/(\d+)\s*bathroom/i);
  if (guestMatch) maxGuests = parseInt(guestMatch[1]);
  if (bedroomMatch) bedrooms = parseInt(bedroomMatch[1]);
  if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1]);

  // Detect property type from name/description
  const lowerText = (name + ' ' + description).toLowerCase();
  if (lowerText.includes('villa')) propertyType = 'villa';
  else if (lowerText.includes('apartment') || lowerText.includes('flat')) propertyType = 'apartment';
  else if (lowerText.includes('cottage')) propertyType = 'cottage';
  else if (lowerText.includes('hotel')) propertyType = 'hotel';
  else if (lowerText.includes('penthouse')) propertyType = 'penthouse';
  else if (lowerText.includes('banda')) propertyType = 'banda';

  // Clean up the name - remove "- Airbnb" suffix, location suffixes
  name = name
    .replace(/\s*[-–]\s*(Airbnb|Houses for Rent|Villas for Rent|Apartments for Rent).*$/i, '')
    .replace(/\s*\|\s*Airbnb$/i, '')
    .trim();

  // Final validation: if we didn't get a usable name or any images, the scrape failed
  // (blocked page, JS-only content, or bot wall). Fail loudly instead of saving junk.
  if (!name || /^(404|Not Found|Page Not Found)$/i.test(name)) {
    throw new Error('Could not parse the Airbnb listing. It may be unavailable or blocked by Airbnb.');
  }

  return {
    name,
    description: description.slice(0, 5000),
    property_type: propertyType,
    address,
    city,
    latitude,
    longitude,
    price_per_night: pricePerNight,
    currency,
    max_guests: maxGuests,
    bedrooms,
    bathrooms,
    amenities,
    images: images.slice(0, 20),
    rating,
    review_count: reviewCount,
    source_url: url,
    source: 'airbnb',
  };
}

function extractMeta(html: string, name: string): string | null {
  // Try property= first, then name=
  const propMatch = html.match(new RegExp(`property="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+property="${name}"`, 'i'));
  if (propMatch) return propMatch[1];

  const nameMatch = html.match(new RegExp(`name="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+name="${name}"`, 'i'));
  return nameMatch ? nameMatch[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    // Resolve the acting user via SSR client first, with a manual JWT
    // fallback for the chunked / base64- cookie shapes @supabase/ssr@0.3
    // fails to decode. See src/lib/import/auth.ts.
    const auth = await resolveImportUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { user } = auth;
    const supabase = await createServerClient();

    const { url } = await request.json();
    const cleanUrl = typeof url === 'string' ? url.trim() : '';

    if (!isAllowedAirbnbUrl(cleanUrl)) {
      return NextResponse.json(
        { error: 'Please provide a valid Airbnb listing URL' },
        { status: 400 }
      );
    }

    // Extract and validate
    const listingId = extractAirbnbId(cleanUrl);
    if (!listingId) {
      return NextResponse.json(
        { error: 'Could not find Airbnb listing ID in URL. Please use a URL like airbnb.com/rooms/12345' },
        { status: 400 }
      );
    }

    // Scrape the listing
    const data = await scrapeAirbnb(cleanUrl);

    // Log the import attempt
    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: 'airbnb',
      source_url: cleanUrl,
      listing_type: 'property',
      status: 'completed',
      imported_data: data as any,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('Airbnb import error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to import Airbnb listing' },
      { status: 500 }
    );
  }
}
