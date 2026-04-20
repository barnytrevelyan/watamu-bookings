import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/import/booking-com
 *
 * Accepts a Booking.com hotel URL, scrapes the listing data,
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
  source: 'booking_com';
}

/**
 * SSRF guard — only allow https fetches to a booking.com host.
 * Without this, the user-supplied `url` goes straight to fetch() and can hit
 * internal metadata endpoints (e.g. 169.254.169.254) as long as the raw string
 * includes "booking.com".
 */
function isAllowedBookingComUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    // Match booking.com and all its locale/subdomain variants:
    // www.booking.com, secure.booking.com, m.booking.com, de.booking.com, etc.
    return /(^|\.)booking\.com$/.test(host);
  } catch {
    return false;
  }
}

function extractMeta(html: string, name: string): string | null {
  const propMatch = html.match(new RegExp(`property="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+property="${name}"`, 'i'));
  if (propMatch) return propMatch[1];

  const nameMatch = html.match(new RegExp(`name="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+name="${name}"`, 'i'));
  return nameMatch ? nameMatch[1] : null;
}

/**
 * Decode HTML entities that booking.com uses in meta content and JSON payloads
 * (e.g. &amp;, &#39;). Kept small and dependency-free.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

async function scrapeBookingCom(url: string): Promise<ImportedProperty> {
  if (!isAllowedBookingComUrl(url)) {
    throw new Error('URL is not a valid Booking.com https URL');
  }

  // Fetch the page HTML with a 15s timeout. Booking.com's hotel pages are heavy
  // and can be slow on first render, so give them a bit more headroom than
  // Airbnb (10s).
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
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
    throw new Error(`Failed to fetch Booking.com listing: ${response.status}`);
  }

  const html = await response.text();

  // Booking.com uses their own soft-404 ("We couldn't find the page you're looking for")
  // with HTTP 200 when a hotel slug doesn't resolve. Bail early.
  if (/(We couldn.?t find the page|This page isn.?t available)/i.test(html) && html.length < 50_000) {
    throw new Error('That Booking.com listing could not be found. Please check the URL.');
  }

  // ---------------------------------------------------------------------
  // 1. JSON-LD structured data.
  // Booking.com embeds at least one Hotel / LodgingBusiness JSON-LD block
  // per hotel page — that's where the best-quality name, rating, and
  // address live.
  // ---------------------------------------------------------------------
  let jsonLd: any = null;
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const type = parsed['@type'];
      const isListing =
        type === 'Hotel' ||
        type === 'LodgingBusiness' ||
        type === 'Resort' ||
        type === 'BedAndBreakfast' ||
        type === 'Apartment' ||
        type === 'House' ||
        type === 'Product';
      if (isListing) { jsonLd = parsed; break; }
      if (!jsonLd && parsed?.name && type !== 'BreadcrumbList' && type !== 'Organization' && type !== 'WebSite') {
        jsonLd = parsed;
      }
    } catch {}
  }

  // ---------------------------------------------------------------------
  // 2. Open Graph + Twitter Card + standard meta.
  // ---------------------------------------------------------------------
  const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
  const ogDescription = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogImage = extractMeta(html, 'og:image');

  // ---------------------------------------------------------------------
  // 3. Title tag fallback. Booking.com titles are usually of the form
  //    "Coral Breeze Villa, Watamu – Updated 2025 Prices" — strip the
  //    trailing price/year fluff.
  // ---------------------------------------------------------------------
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch
    ? decodeEntities(titleMatch[1])
        .replace(/\s*[-–|]\s*(Updated|Prices|Reviews|Photos|Hotel|Booking\.com).*$/i, '')
        .replace(/\s*\|\s*Booking\.com$/i, '')
        .trim()
    : '';

  // ---------------------------------------------------------------------
  // 4. Images.
  //   (a) og:image as the cover.
  //   (b) Any other og:image / og:image:url content strings.
  //   (c) Booking.com CDN patterns: bstatic.com (hotel photos) — pull up
  //       to 20 unique urls.
  // ---------------------------------------------------------------------
  const images: string[] = [];
  if (ogImage) images.push(ogImage);

  const ogImageMatches = html.matchAll(/property="og:image(?::url)?"\s+content="([^"]+)"/g);
  for (const m of ogImageMatches) {
    if (!images.includes(m[1])) images.push(m[1]);
  }

  // Booking.com serves hotel photos from bstatic.com; the URL segment
  // "/images/hotel/" is the stable marker.
  const bstaticMatches = html.matchAll(/https:\/\/(?:cf|q)\.bstatic\.com\/(?:x?data\/)?images\/hotel\/[^\s"'<>]+/g);
  for (const m of bstaticMatches) {
    const clean = m[0]
      .replace(/\\u002F/g, '/')
      .replace(/\\\//g, '/')
      .replace(/&quot;$/, '');
    // Prefer the "max1024x768" size so imports are usable without further processing.
    const upscaled = clean.replace(/\/(square\d+|max\d+x\d+)\//, '/max1024x768/');
    if (!images.includes(upscaled) && images.length < 20) {
      images.push(upscaled);
    }
  }

  // ---------------------------------------------------------------------
  // 5. Structured field extraction.
  // ---------------------------------------------------------------------
  let name = (ogTitle && decodeEntities(ogTitle).trim()) || pageTitle || '';
  let description = (ogDescription && decodeEntities(ogDescription).trim()) || '';
  let pricePerNight: number | null = null;
  let currency = 'KES';
  let maxGuests: number | null = null;
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let rating: number | null = null;
  let reviewCount: number | null = null;
  let address = '';
  let city = 'Watamu';
  let propertyType = 'house';

  if (jsonLd) {
    if (jsonLd.name) name = String(jsonLd.name);
    if (jsonLd.description) description = String(jsonLd.description);
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
    if (jsonLd.priceRange && !pricePerNight) {
      // priceRange is a string like "$$" or "KES 5000 - KES 20000" — pull the first number.
      const priceMatch = String(jsonLd.priceRange).match(/([A-Z]{3})?\s*([\d,]+(?:\.\d+)?)/);
      if (priceMatch) {
        pricePerNight = parseFloat(priceMatch[2].replace(/,/g, ''));
        if (priceMatch[1]) currency = priceMatch[1];
      }
    }
  }

  // Booking.com also surfaces coordinates in an `data-atlas-latlng` attribute
  // and in a `<meta name="coordinates">`-style tag on some page variants.
  if (latitude === null || longitude === null) {
    const latlngAttr = html.match(/data-atlas-latlng="(-?\d+\.\d+),(-?\d+\.\d+)"/);
    if (latlngAttr) {
      latitude = parseFloat(latlngAttr[1]);
      longitude = parseFloat(latlngAttr[2]);
    }
  }

  // Guests / bedrooms / bathrooms hints from description or title.
  const blob = (description + ' ' + name).toLowerCase();
  const guestMatch = blob.match(/(\d+)\s*(?:guest|sleeps|people)/);
  const bedroomMatch = blob.match(/(\d+)\s*bedroom/);
  const bathroomMatch = blob.match(/(\d+)\s*bathroom/);
  if (guestMatch) maxGuests = parseInt(guestMatch[1], 10);
  if (bedroomMatch) bedrooms = parseInt(bedroomMatch[1], 10);
  if (bathroomMatch) bathrooms = parseInt(bathroomMatch[1], 10);

  // Property-type heuristics — same taxonomy as the Airbnb importer so both
  // flows land on valid values in wb_properties.property_type.
  const lowerText = blob;
  if (lowerText.includes('villa')) propertyType = 'villa';
  else if (lowerText.includes('apartment') || lowerText.includes('flat') || lowerText.includes('condo')) propertyType = 'apartment';
  else if (lowerText.includes('cottage')) propertyType = 'cottage';
  else if (lowerText.includes('hotel') || lowerText.includes('resort')) propertyType = 'hotel';
  else if (lowerText.includes('penthouse')) propertyType = 'penthouse';
  else if (lowerText.includes('banda')) propertyType = 'banda';
  else if (lowerText.includes('guesthouse') || lowerText.includes('guest house') || lowerText.includes('bed and breakfast') || lowerText.includes('b&b')) propertyType = 'guesthouse';

  // Clean the name — drop trailing "| Booking.com", "- Watamu, Kenya", etc.
  name = name
    .replace(/\s*\|\s*Booking\.com.*$/i, '')
    .replace(/\s*\(Hotel\),?.*$/i, '')
    .replace(/,\s*Watamu.*$/i, '')
    .trim();

  // Final validation.
  if (!name || /^(404|Not Found|Page Not Found|Access Denied)$/i.test(name)) {
    throw new Error('Could not parse the Booking.com listing. It may be unavailable, region-restricted, or served JavaScript-only.');
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
    amenities: [],
    images: images.slice(0, 20),
    rating,
    review_count: reviewCount,
    source_url: url,
    source: 'booking_com',
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { url } = await request.json();
    const cleanUrl = typeof url === 'string' ? url.trim() : '';

    if (!isAllowedBookingComUrl(cleanUrl)) {
      return NextResponse.json(
        { error: 'Please provide a valid Booking.com listing URL (https://www.booking.com/hotel/...)' },
        { status: 400 }
      );
    }

    const data = await scrapeBookingCom(cleanUrl);

    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: 'booking_com',
      source_url: cleanUrl,
      listing_type: 'property',
      status: 'completed',
      imported_data: data as any,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('Booking.com import error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to import Booking.com listing' },
      { status: 500 }
    );
  }
}
