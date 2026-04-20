import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/import/fishingbooker
 *
 * Accepts a FishingBooker charter URL, scrapes the listing data,
 * and returns a pre-filled boat object for the owner to review.
 *
 * Body: { url: string }
 * Returns: { data: ImportedBoat } or { error: string }
 */

interface ImportedTrip {
  name: string;
  duration_hours: number;
  price_total: number;
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
  images: string[];
  rating: number | null;
  review_count: number | null;
  location: string;
  source_url: string;
  source: 'fishingbooker';
}

/**
 * SSRF guard — only allow https fetches to a fishingbooker.* host.
 */
function isAllowedFishingBookerUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return /(^|\.)fishingbooker\.[a-z.]+$/.test(host);
  } catch {
    return false;
  }
}

async function scrapeFishingBooker(url: string): Promise<ImportedBoat> {
  if (!isAllowedFishingBookerUrl(url)) {
    throw new Error('URL is not a valid FishingBooker https URL');
  }

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
    throw new Error(`Failed to fetch FishingBooker listing: ${response.status}`);
  }

  const html = await response.text();

  // 1. JSON-LD structured data (FishingBooker uses this extensively)
  let jsonLd: any = null;
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      // Look for the TouristAttraction or Product type
      if (parsed['@type'] === 'Product' || parsed['@type'] === 'TouristAttraction' || parsed.name) {
        jsonLd = parsed;
      }
    } catch {}
  }

  // 2. Open Graph meta tags
  const ogTitle = extractMeta(html, 'og:title');
  const ogDescription = extractMeta(html, 'og:description');
  const ogImage = extractMeta(html, 'og:image');

  // 3. Title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(/\s*[-–|].*FishingBooker.*$/i, '').trim() : '';

  // 4. Extract images
  const images: string[] = [];
  if (ogImage) images.push(ogImage);

  // FishingBooker uses img tags with specific patterns
  const imgMatches = html.matchAll(/src="(https:\/\/[^"]*fishingbooker[^"]*\/(?:charter|boat|listing)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const m of imgMatches) {
    if (!images.includes(m[1]) && images.length < 20) {
      images.push(m[1]);
    }
  }

  // Also look for gallery images
  const galleryMatches = html.matchAll(/data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const m of galleryMatches) {
    if (!images.includes(m[1]) && images.length < 20) {
      images.push(m[1]);
    }
  }

  // Also look for srcset images
  const srcsetMatches = html.matchAll(/srcset="([^"]+)"/gi);
  for (const m of srcsetMatches) {
    const urls = m[1].split(',').map(s => s.trim().split(' ')[0]);
    for (const u of urls) {
      if (u.includes('fishingbooker') && !images.includes(u) && images.length < 20) {
        images.push(u);
      }
    }
  }

  // 5. Extract listing details
  let name = ogTitle || pageTitle || '';
  let description = ogDescription || '';
  let boatType = 'sport_fisher';
  let lengthFt: number | null = null;
  let capacity: number | null = null;
  let crewSize: number | null = null;
  let captainName: string | null = null;
  let captainBio: string | null = null;
  let captainExperience: number | null = null;
  let rating: number | null = null;
  let reviewCount: number | null = null;
  let targetSpecies: string[] = [];
  let fishingTechniques: string[] = [];
  let location = 'Watamu, Kenya';
  const trips: ImportedTrip[] = [];

  // Clean name
  name = name
    .replace(/\s*[-–|]\s*FishingBooker.*$/i, '')
    .replace(/\s*in\s+Watamu.*$/i, '')
    .trim();

  // From JSON-LD
  if (jsonLd) {
    if (jsonLd.name) name = jsonLd.name;
    if (jsonLd.description) description = jsonLd.description;
    if (jsonLd.aggregateRating) {
      rating = parseFloat(jsonLd.aggregateRating.ratingValue) || null;
      reviewCount = parseInt(jsonLd.aggregateRating.reviewCount) || null;
    }
    if (jsonLd.offers) {
      const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
      for (const offer of offers) {
        if (offer.name && offer.price) {
          trips.push({
            name: offer.name,
            duration_hours: extractDuration(offer.name),
            price_total: parseFloat(offer.price) || 0,
            price_per_person: null,
            trip_type: inferTripType(offer.name),
            departure_time: null,
            description: offer.description || '',
            includes: [],
            target_species: [],
          });
        }
      }
    }
  }

  // Extract boat length from HTML
  const lengthMatch = html.match(/(\d+)\s*(?:ft|feet|foot)/i);
  if (lengthMatch) lengthFt = parseInt(lengthMatch[1]);

  // Extract capacity
  const capacityMatch = html.match(/(?:up to|max|capacity|accommodates?)\s*(\d+)\s*(?:people|person|angler|guest|passenger|pax)/i);
  if (capacityMatch) capacity = parseInt(capacityMatch[1]);

  // Extract crew size
  const crewMatch = html.match(/(\d+)\s*crew/i);
  if (crewMatch) crewSize = parseInt(crewMatch[1]);

  // Extract captain name - look for "Captain [Name]" pattern
  const captainMatch = html.match(/Captain\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (captainMatch) captainName = captainMatch[1];

  // Extract target species from page
  const knownSpecies = [
    'Marlin', 'Sailfish', 'Yellowfin Tuna', 'Tuna', 'Wahoo', 'Dorado', 'Mahi-mahi',
    'Giant Trevally', 'GT', 'Kingfish', 'Barracuda', 'Snapper', 'Grouper',
    'Swordfish', 'Shark', 'Bonito', 'Cobia', 'Roosterfish', 'Tarpon',
  ];
  for (const species of knownSpecies) {
    if (html.toLowerCase().includes(species.toLowerCase())) {
      targetSpecies.push(species);
    }
  }

  // Extract fishing techniques
  const knownTechniques = [
    'Trolling', 'Bottom Fishing', 'Popping', 'Jigging', 'Fly Fishing',
    'Live Bait', 'Drift Fishing', 'Reef Fishing', 'Deep Sea', 'Spinning',
  ];
  for (const tech of knownTechniques) {
    if (html.toLowerCase().includes(tech.toLowerCase())) {
      fishingTechniques.push(tech);
    }
  }

  // Try to extract trip packages from structured content
  // FishingBooker uses specific HTML patterns for trips
  const tripBlockMatches = html.matchAll(/<h3[^>]*>([^<]*(?:trip|fishing|hour|day)[^<]*)<\/h3>/gi);
  for (const m of tripBlockMatches) {
    const tripName = m[1].trim();
    if (tripName && !trips.find(t => t.name === tripName)) {
      // Look for price near this trip name
      const priceNearby = html.slice(
        Math.max(0, html.indexOf(tripName) - 200),
        html.indexOf(tripName) + 500
      );
      const priceMatch = priceNearby.match(/\$\s*([\d,]+)/);
      // Replace ALL commas — previously `replace(',', '')` only stripped the first,
      // turning "$1,234,567" into 1234.
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

      trips.push({
        name: tripName,
        duration_hours: extractDuration(tripName),
        price_total: price,
        price_per_person: null,
        trip_type: inferTripType(tripName),
        departure_time: null,
        description: '',
        includes: [],
        target_species: [],
      });
    }
  }

  // Detect boat type from name/description
  const text = (name + ' ' + description).toLowerCase();
  if (text.includes('dhow')) boatType = 'dhow';
  else if (text.includes('catamaran')) boatType = 'catamaran';
  else if (text.includes('speedboat')) boatType = 'speedboat';
  else if (text.includes('kayak')) boatType = 'kayak';
  else if (text.includes('deep sea') || text.includes('deep-sea')) boatType = 'deep_sea';
  else if (text.includes('glass bottom')) boatType = 'glass_bottom';

  // Validation: empty/garbage name indicates scrape failure — fail loudly.
  if (!name || /^(404|Not Found|Page Not Found|Access Denied)$/i.test(name)) {
    throw new Error('Could not parse the FishingBooker listing. It may be unavailable or blocked.');
  }

  return {
    name,
    description: description.slice(0, 5000),
    boat_type: boatType,
    length_ft: lengthFt,
    capacity,
    crew_size: crewSize,
    captain_name: captainName,
    captain_bio: captainBio,
    captain_experience_years: captainExperience,
    target_species: targetSpecies,
    fishing_techniques: fishingTechniques,
    trips,
    images: images.slice(0, 20),
    rating,
    review_count: reviewCount,
    location,
    source_url: url,
    source: 'fishingbooker',
  };
}

function extractDuration(text: string): number {
  const hourMatch = text.match(/(\d+)\s*(?:hour|hr)/i);
  if (hourMatch) return parseInt(hourMatch[1]);
  if (/half\s*day/i.test(text)) return 4;
  if (/full\s*day/i.test(text)) return 8;
  if (/overnight/i.test(text)) return 24;
  return 4; // default
}

function inferTripType(text: string): string {
  const lower = text.toLowerCase();
  if (/half\s*day.*morning/i.test(lower)) return 'half_day_morning';
  if (/half\s*day.*afternoon/i.test(lower)) return 'half_day_afternoon';
  if (/half\s*day/i.test(lower)) return 'half_day';
  if (/full\s*day/i.test(lower)) return 'full_day';
  if (/overnight/i.test(lower)) return 'overnight';
  if (/multi/i.test(lower)) return 'multi_day';
  if (/sunset/i.test(lower)) return 'sunset_cruise';

  // Infer from hours
  const hours = extractDuration(text);
  if (hours <= 5) return 'half_day';
  if (hours <= 10) return 'full_day';
  if (hours <= 24) return 'overnight';
  return 'multi_day';
}

function extractMeta(html: string, name: string): string | null {
  const propMatch = html.match(new RegExp(`property="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+property="${name}"`, 'i'));
  if (propMatch) return propMatch[1];

  const nameMatch = html.match(new RegExp(`name="${name}"\\s+content="([^"]*)"`, 'i'))
    || html.match(new RegExp(`content="([^"]*)"\\s+name="${name}"`, 'i'));
  return nameMatch ? nameMatch[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Verify user via getUser() (validates JWT) rather than getSession() which
    // only reads the cookie without verification.
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { url } = await request.json();
    const cleanUrl = typeof url === 'string' ? url.trim() : '';

    if (!isAllowedFishingBookerUrl(cleanUrl)) {
      return NextResponse.json(
        { error: 'Please provide a valid FishingBooker charter URL' },
        { status: 400 }
      );
    }

    const data = await scrapeFishingBooker(cleanUrl);

    // Log the import
    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: 'fishingbooker',
      source_url: cleanUrl,
      listing_type: 'boat',
      status: 'completed',
      imported_data: data as any,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('FishingBooker import error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to import FishingBooker listing' },
      { status: 500 }
    );
  }
}
