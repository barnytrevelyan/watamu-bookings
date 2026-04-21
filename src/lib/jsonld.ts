/**
 * JSON-LD helpers for SEO + AI search visibility.
 * These produce schema.org structured-data blocks that Google, Bing,
 * Perplexity, ChatGPT Search and friends read to populate rich cards.
 *
 * Usage in a page:
 *   <JsonLd data={propertySchema(property)} />
 */

import type { Place, PlaceContext } from './types';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://kwetu.ke';

/** Shallow brand-config shape accepted by org / website / activity schemas. */
type BrandHost = Pick<PlaceContext['host'], 'brand_name' | 'brand_short' | 'host'>;

function siteUrl(host?: BrandHost | null): string {
  if (host?.host && host.host !== 'localhost' && host.host !== 'localhost:3000') {
    return `https://${host.host.replace(/^www\./, '')}`;
  }
  return SITE;
}

interface PropertyLike {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  property_type?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  base_price_per_night?: number | string | null;
  currency?: string | null;
  max_guests?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  avg_rating?: number | string | null;
  review_count?: number | null;
  images?: Array<{ url: string; alt_text?: string | null; sort_order?: number | null }> | null;
}

interface BoatLike {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  boat_type?: string | null;
  length_ft?: number | string | null;
  capacity?: number | null;
  captain_name?: string | null;
  home_port?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  currency?: string | null;
  avg_rating?: number | string | null;
  review_count?: number | null;
  images?: Array<{ url: string; alt_text?: string | null; sort_order?: number | null }> | null;
  trips?: Array<{ price_total?: number | string | null }> | null;
}

export function propertySchema(p: PropertyLike, place?: Place | null) {
  const url = `${SITE}/properties/${p.slug}`;
  const imgs = (p.images ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => i.url)
    .filter(Boolean);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    '@id': url,
    name: p.name,
    url,
    description: p.description || undefined,
    image: imgs.length ? imgs : undefined,
    priceRange: p.base_price_per_night
      ? `${p.currency || 'KES'} ${Number(p.base_price_per_night).toLocaleString()}`
      : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.address || undefined,
      addressLocality: p.city || place?.name || 'Watamu',
      addressRegion: p.county || 'Kilifi',
      addressCountry: p.country || 'Kenya',
    },
    geo: p.latitude && p.longitude
      ? {
          '@type': 'GeoCoordinates',
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
        }
      : undefined,
    numberOfRooms: p.bedrooms || undefined,
    occupancy: p.max_guests
      ? { '@type': 'QuantitativeValue', maxValue: p.max_guests }
      : undefined,
  };

  const rating = Number(p.avg_rating);
  if (rating > 0 && (p.review_count ?? 0) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount: p.review_count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

export function boatSchema(b: BoatLike, place?: Place | null) {
  const url = `${SITE}/boats/${b.slug}`;
  const imgs = (b.images ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => i.url)
    .filter(Boolean);

  const minPrice =
    Array.isArray(b.trips) && b.trips.length > 0
      ? Math.min(
          ...b.trips
            .map((t) => Number(t.price_total))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      : undefined;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Fishing charter',
    '@id': url,
    name: b.name,
    url,
    description: b.description || undefined,
    image: imgs.length ? imgs : undefined,
    provider: {
      '@type': 'LocalBusiness',
      name: b.captain_name
        ? `Captain ${b.captain_name.replace(/^captain\s+/i, '')}`
        : `${place?.name || 'Watamu'} charter`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: b.home_port || place?.name || 'Watamu',
        addressCountry: 'Kenya',
      },
    },
    areaServed: {
      '@type': 'Place',
      name: place ? `${place.name}, Kenya` : 'Watamu, Kenya',
      geo: b.latitude && b.longitude
        ? {
            '@type': 'GeoCoordinates',
            latitude: Number(b.latitude),
            longitude: Number(b.longitude),
          }
        : place?.centroid_lat && place?.centroid_lng
          ? {
              '@type': 'GeoCoordinates',
              latitude: Number(place.centroid_lat),
              longitude: Number(place.centroid_lng),
            }
          : undefined,
    },
    offers: minPrice && Number.isFinite(minPrice)
      ? {
          '@type': 'Offer',
          price: minPrice,
          priceCurrency: b.currency || 'KES',
          availability: 'https://schema.org/InStock',
        }
      : undefined,
  };

  const rating = Number(b.avg_rating);
  if (rating > 0 && (b.review_count ?? 0) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount: b.review_count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

export function organizationSchema(host?: BrandHost | null) {
  const url = siteUrl(host);
  const brand = host?.brand_name ?? 'Kwetu';
  const locality = host?.brand_short ?? 'Watamu';
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand,
    url,
    logo: `${url}/icon-512.png`,
    description: `Local marketplace for beachfront accommodation and fishing charters in ${locality}, Kenya.`,
    sameAs: [],
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality,
      addressRegion: 'Kilifi',
      addressCountry: 'Kenya',
    },
  };
}

export function websiteSchema(host?: BrandHost | null) {
  const url = siteUrl(host);
  const brand = host?.brand_name ?? 'Kwetu';
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand,
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${url}/properties?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function touristDestinationSchema(place: Place) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: place.name,
    url: `${SITE}/`,
    description:
      place.description ??
      `${place.name} is a coastal town in Kilifi County, Kenya.`,
    geo: place.centroid_lat && place.centroid_lng
      ? {
          '@type': 'GeoCoordinates',
          latitude: Number(place.centroid_lat),
          longitude: Number(place.centroid_lng),
        }
      : undefined,
    // Tourist attractions live in place.map_pois_json when we populate them.
  };
}

export function breadcrumbSchema(
  items: Array<{ name: string; url: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE}${item.url}`,
    })),
  };
}
