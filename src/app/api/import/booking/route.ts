import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/import/booking
 *
 * Accepts a Booking.com hotel / property URL, scrapes the public listing,
 * and returns a pre-filled property object for the owner to review.
 *
 * Booking.com URLs we support:
 *   https://www.booking.com/hotel/<cc>/<slug>.<locale>.html
 *   https://www.booking.com/hotel/<cc>/<slug>.html
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
  source: 'booking';
}

/**
 * SSRF guard — only allow https fetches to booking.com and subdomains.
 */
function isAllowedBookingUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return /(^|\.)booking\.com$/.test(host);
  } catch {
    return false;
  }
}

function extractBookingSlug(url: string): string | null {
  // Match /hotel/<cc>/<slug>(.<locale>)?.html
  const match = url.match(/booking\.com\/hotel\/[a-z]{2}\/([a-z0-9-]+)(?:\.[a-z-]+)?\.html/i);
  return match ? match[1] : null;
}

function extractMeta(html: string, name: string): string | null {
  const propMatch =
    html.match(new RegExp(`property="${name}"\\s+content="([^"]*)"`, 'i')) ||
    html.match(new RegExp(`content="([^"]*)"\\s+property="${name}"`, 'i'));
  if (propMatch) return propMatch[1];
  const nameMatch =
    html.match(new RegExp(`name="${name}"\\s+content="([^"]*)"`, 'i')) ||
    html.match(new RegExp(`content="([^"]*)"\\s+name="${name}"`, 'i'));
  return nameMatch ? nameMatch[1] : null;
}

async function scrapeBooking(url: string): Promise<ImportedProperty> {
  if (!isAllowedBookingUrl(url)) {
    throw new Error('URL is not a valid Booking.com https URL');
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(t);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Booking.com listing: ${response.status}`);
  }

  const html = await response.text();

  // Booking.com sometimes serves a "sorry, this page isn't available" page with 200.
  if (
    /Sorry, this page isn&#39;t available|page isn't available/i.test(html) &&
    html.length < 15_000
  ) {
    throw new Error(
      'That Booking.com listing could not be found. Please check the URL.'
    );
  }

  // 1. JSON-LD structured data — Booking.com consistently uses Hotel, LodgingBusiness,
  //    or BedAndBreakfast types with name/address/geo/aggregateRating/priceRange.
  let jsonLd: any = null;
  const jsonLdMatches = html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  );
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const type = parsed['@type'];
      const isListingType =
        type === 'Hotel' ||
        type === 'LodgingBusiness' ||
        type === 'BedAndBreakfast' ||
        type === 'Resort' ||
        type === 'Motel' ||
        type === 'Product';
      if (isListingType) {
        jsonLd = parsed;
        break;
      }
      if (
        !jsonLd &&
        parsed &&
        parsed.name &&
        type !== 'BreadcrumbList' &&
        type !== 'Organization'
      ) {
        jsonLd = parsed;
      }
    } catch {
      // ignore malformed blocks
    }
  }

  // 2. Open Graph + twitter meta
  const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
  const ogDescription =
    extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogImage = extractMeta(html, 'og:image');
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch
    ? titleMatch[1].replace(/\s*[-–|].*$/, '').trim()
    : '';

  // 3. Images — Booking.com hosts photos on cf.bstatic.com and xdetail-images.booking.com.
  const images: string[] = [];
  if (ogImage) images.push(ogImage);
  const imgMatches = html.matchAll(
    /https:\/\/(?:cf\.bstatic\.com|xdetail-images\.booking\.com)\/(?:images|xdata\/images)\/[^\s"'<>)]+\.(?:jpg|jpeg|webp|png)/gi
  );
  for (const m of imgMatches) {
    const clean = m[0].replace(/\\u002F/g, '/');
    if (!images.includes(clean) && images.length < 20) images.push(clean);
  }

  // 4. Seed defaults
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
  const amenities: string[] = [];
  let address = '';
  let city = 'Watamu';
  let propertyType = 'house';

  // 5. Pull from JSON-LD
  if (jsonLd) {
    if (jsonLd.name) name = jsonLd.name;
    if (jsonLd.description) description = jsonLd.description;
    if (jsonLd.address) {
      address =
        typeof jsonLd.address === 'string'
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
    if (jsonLd.priceRange && typeof jsonLd.priceRange === 'string') {
      // e.g. "$$" or "KES 12,000 - KES 25,000" — grab the first number we see.
      const numeric = jsonLd.priceRange.match(/([\d,]+(?:\.\d+)?)/);
      if (numeric) pricePerNight = parseFloat(numeric[1].replace(/,/g, ''));
      const cur = jsonLd.priceRange.match(/[A-Z]{3}/);
      if (cur) currency = cur[0];
    }
    // Some Hotel objects publish number of rooms + sleeps
    if (jsonLd.numberOfRooms) {
      const parsed = parseInt(String(jsonLd.numberOfRooms));
      if (Number.isFinite(parsed)) bedrooms = parsed;
    }
  }

  // 6. Parse guest/bedroom/bathroom hints from the name/description
  const guestMatch = (description + ' ' + name).match(/(\d+)\s*(?:guest|sleeps|people)/i);
  const bedroomMatch = (description + ' ' + name).match(/(\d+)\s*bedroom/i);
  const bathroomMatch = (description + ' ' + name).match(/(\d+)\s*bath/i);
  if (guestMatch) maxGuests = parseInt(guestMatch[1]);
  if (bedroomMatch) bedrooms = parseInt(bedroomMatch[1]);
  if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1]);

  // 7. Detect property type
  const lowerText = (name + ' ' + description).toLowerCase();
  if (lowerText.includes('villa')) propertyType = 'villa';
  else if (lowerText.includes('apartment') || lowerText.includes('flat'))
    propertyType = 'apartment';
  else if (lowerText.includes('cottage')) propertyType = 'cottage';
  else if (lowerText.includes('hotel') || lowerText.includes('resort'))
    propertyType = 'hotel';
  else if (lowerText.includes('penthouse')) propertyType = 'penthouse';
  else if (lowerText.includes('banda')) propertyType = 'banda';
  else if (lowerText.includes('bungalow')) propertyType = 'bungalow';

  // 8. Clean the name — strip Booking.com brand trails
  name = name
    .replace(/\s*[-–]\s*(Booking\.com|Updated \d{4}|Hotel).*$/i, '')
    .replace(/\s*\|\s*Booking\.com$/i, '')
    .trim();

  if (!name || /^(404|Not Found|Page Not Found)$/i.test(name)) {
    throw new Error(
      'Could not parse the Booking.com listing. It may be unavailable or blocked.'
    );
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
    source: 'booking',
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { url } = await request.json();
    const cleanUrl = typeof url === 'string' ? url.trim() : '';

    if (!isAllowedBookingUrl(cleanUrl)) {
      return NextResponse.json(
        { error: 'Please provide a valid Booking.com listing URL' },
        { status: 400 }
      );
    }

    const slug = extractBookingSlug(cleanUrl);
    if (!slug) {
      return NextResponse.json(
        {
          error:
            'Could not find a listing slug in the URL. Use a URL like booking.com/hotel/ke/your-property.html',
        },
        { status: 400 }
      );
    }

    const data = await scrapeBooking(cleanUrl);

    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: 'booking',
      source_url: cleanUrl,
      listing_type: 'property',
      status: 'completed',
      imported_data: data as any,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to import Booking.com listing' },
      { status: 500 }
    );
  }
}
