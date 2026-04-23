import Link from "next/link";
import Image from "next/image";
import { createClient as createServerClient } from "@/lib/supabase/server";
import PropertyCard from "@/components/PropertyCard";
import BoatCard from "@/components/BoatCard";
import SearchFilters from "@/components/SearchFilters";
import ShellSearch from "@/components/ShellSearch";
import DestinationCardLink from "@/components/DestinationCardLink";
import WeatherWidget from "@/components/WeatherWidget";
import { Button } from "@/components/ui/Button";
import JsonLd from "@/components/JsonLd";
import {
  organizationSchema,
  websiteSchema,
  touristDestinationSchema,
  breadcrumbSchema,
  faqSchema,
  marketplaceServiceSchema,
} from "@/lib/jsonld";
import { STOCK_IMAGES, getPropertyImage, getBoatImage } from "@/lib/images";
import { getCurrentPlace, listActivePlaces } from "@/lib/places/context";
import type { Property, Boat, Place, PlaceFeature, PlaceContext } from "@/lib/types";

const FEATURE_LABELS: Record<PlaceFeature, string> = {
  properties: "Stays",
  boats: "Boats",
  tides: "Tides",
  "marine-park": "Marine Park",
  safari: "Safari",
  adventure: "Adventure",
  lakes: "Lakes",
  cultural: "Cultural",
};

async function getFeaturedProperties(place: Place | null): Promise<Property[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("wb_properties")
    .select(
      `
      *,
      images:wb_images(id, url, alt_text, sort_order),
      reviews:wb_reviews(rating)
    `
    )
    .eq("is_featured", true)
    .eq("is_published", true)
    .eq("is_test", false);
  if (place) query = query.eq("place_id", place.id);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Error fetching featured properties:", error);
    return [];
  }
  return data ?? [];
}

async function getFeaturedBoats(place: Place | null): Promise<Boat[]> {
  const supabase = await createServerClient();
  const baseSelect = `
      *,
      images:wb_images(id, url, alt_text, sort_order),
      reviews:wb_reviews(rating),
      trips:wb_boat_trips(id, name, duration_hours, price_total)
    `;

  const select = place
    ? `${baseSelect.replace(/\s+$/, '')}, wb_boat_places!inner(place_id)`
    : baseSelect;

  let query = supabase
    .from("wb_boats")
    .select(select)
    .eq("is_featured", true)
    .eq("is_published", true)
    .eq("is_test", false);
  if (place) query = query.eq("wb_boat_places.place_id", place.id);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Error fetching featured boats:", error);
    return [];
  }
  return (data as unknown as Boat[]) ?? [];
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Browse",
    description:
      "Explore beachfront villas, cosy apartments, and fishing boats. Filter by dates, budget, and preferences.",
  },
  {
    step: "02",
    title: "Book",
    description:
      "Reserve instantly with secure payments via M-Pesa or card. Get confirmation within minutes.",
  },
  {
    step: "03",
    title: "Experience",
    description:
      "Arrive and enjoy your stay or charter. Our local hosts ensure everything is perfect.",
  },
];

type PlaceActivity = {
  title: string;
  description: string;
  // Optional heroicon keyword — one of the hardcoded slots below. Anything
  // unrecognised falls back to a generic sun icon, so the page never breaks
  // on a typo in the DB.
  icon?: 'globe' | 'sun' | 'fish' | 'beach' | 'people' | 'compass';
};

// Icon slots used when activities_json supplies a `icon` key. Kept inline so
// we don't need to pull in a whole icon library on a page that's already
// LCP-sensitive.
const ACTIVITY_ICONS: Record<NonNullable<PlaceActivity['icon']>, JSX.Element> = {
  globe: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558" />
    </svg>
  ),
  sun: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
  fish: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
  beach: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
    </svg>
  ),
  people: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  ),
  compass: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M15 9l-1.5 4.5L9 15l1.5-4.5L15 9Z" />
    </svg>
  ),
};

const WHY_THIS_PLACE_FALLBACK = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558" />
      </svg>
    ),
    title: "Marine National Park",
    description:
      "Pristine coral reefs, sea turtles, and 600+ species of fish right on your doorstep.",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    ),
    title: "Deep-Sea Fishing",
    description:
      "East Africa's premier sport fishing grounds. Target marlin, sailfish, tuna and wahoo year-round.",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
      </svg>
    ),
    title: "Pristine Beaches",
    description:
      "White sand beaches stretching for kilometres, turquoise waters, and hidden coves.",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    title: "Authentic Swahili Culture",
    description:
      "Swahili hospitality, fresh seafood, and deep-rooted coastal history and heritage.",
  },
];

export default async function HomePage() {
  const { place, host } = await getCurrentPlace();

  // Multi-place shell (kwetu.ke root) — render the destination picker
  // instead of the place-scoped home. Funnels every guest into a concrete
  // place first, which is how the rest of the site is designed to work.
  if (!place) {
    const destinations = await listActivePlaces();
    return (
      <ShellLanding host={host} destinations={destinations} />
    );
  }

  // Boats section is only meaningful for places that offer boats — inland
  // destinations get an empty array and the section drops out below.
  const showBoats = place.features.includes('boats');
  const [properties, boats] = await Promise.all([
    getFeaturedProperties(place),
    showBoats ? getFeaturedBoats(place) : Promise.resolve([] as Boat[]),
  ]);

  // Copy derived from the current place — falls back to Watamu defaults
  // so the watamubookings.com host still reads as before.
  const placeName = place?.name ?? host.brand_short;
  const heroImage =
    place?.hero_image_url ??
    "https://jiyoxdeiyydyxjymahrh.supabase.co/storage/v1/object/public/watamu-images/hero/watamu-hero.jpg";
  // "Kwetu" is Swahili for "our home/place" — it's the brand name but NOT a
  // geographic noun. On a resolved place ("Your stay in Watamu starts here.")
  // the copy reads naturally. On the generic kwetu.ke root we lean into the
  // Swahili meaning instead of treating Kwetu as a location.
  const heroHeadline =
    place?.short_tagline ??
    (place
      ? `Your stay in ${placeName} starts here.`
      : `Make the Kenyan coast feel like Kwetu.`);
  const heroSubcopy =
    place
      ? `Book stunning beachfront stays and world-class fishing charters in ${placeName}, on Kenya's most beautiful coastline.`
      : "Book stunning beachfront stays and world-class fishing charters on Kenya's coast.";

  // Activities come from wb_places.activities_json when a destination has
  // been fully filled in; otherwise we fall back to the generic coast-wide
  // list. activities_json is validated loosely — unknown icon keys are
  // ignored rather than crashing the page.
  const rawActivities = Array.isArray((place as any)?.activities_json)
    ? ((place as any).activities_json as unknown[])
    : [];
  const placeActivities: Array<{ title: string; description: string; icon: JSX.Element }> =
    rawActivities
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const r = raw as Partial<PlaceActivity>;
        if (!r.title || !r.description) return null;
        const key = (r.icon && ACTIVITY_ICONS[r.icon]) ? r.icon : 'sun';
        return {
          title: r.title,
          description: r.description,
          icon: ACTIVITY_ICONS[key as NonNullable<PlaceActivity['icon']>],
        };
      })
      .filter((x): x is { title: string; description: string; icon: JSX.Element } => x !== null);
  const activities = placeActivities.length > 0 ? placeActivities : WHY_THIS_PLACE_FALLBACK;

  return (
    <>
      {/* SEO: Organization, WebSite + SearchAction, TouristDestination,
          BreadcrumbList, Service, FAQPage. We emit multiple blocks so
          Google and AI answer engines can match whichever schema is most
          relevant for a given query. Keep FAQ answers terse and factual —
          these are often copy-pasted verbatim into AI responses. */}
      <JsonLd id="ld-org" data={organizationSchema(host)} />
      <JsonLd id="ld-website" data={websiteSchema(host)} />
      <JsonLd
        id="ld-breadcrumb"
        data={breadcrumbSchema([{ name: 'Home', url: '/' }])}
      />
      <JsonLd id="ld-service" data={marketplaceServiceSchema(host)} />
      <JsonLd
        id="ld-faq"
        data={faqSchema([
          {
            question: `What is ${host.brand_name}?`,
            answer: `${host.brand_name} is a Kenya-first booking marketplace for beachfront short-let properties and fishing charters on the Kenyan coast. Hosts keep more of each booking — we charge a flat 7.5% commission, no subscription.`,
          },
          {
            question: 'How do I pay for a booking?',
            answer:
              'You can pay with M-Pesa or a Visa/Mastercard credit or debit card. M-Pesa STK Push payments complete in seconds and are confirmed instantly.',
          },
          {
            question: 'Is my booking refundable?',
            answer:
              "Refund terms are set by each host and displayed on the property or boat page before you book. Most properties offer flexible refunds up to seven days before check-in.",
          },
          {
            question: 'How does Kwetu compare to Airbnb or Booking.com?',
            answer:
              'We focus exclusively on Kenya and charge hosts a flat 7.5% commission (no subscription) versus 15–20%+ on global platforms. Lower fees mean hosts can offer you better rates.',
          },
          {
            question: 'Where does Kwetu operate?',
            answer:
              "We cover Kenya's coastal destinations including Watamu, Malindi, Kilifi, Diani and Lamu, with plans to add more places across the Kenyan coast.",
          },
        ])}
      />
      {place ? <JsonLd id="ld-destination" data={touristDestinationSchema(place)} /> : null}

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[600px] lg:min-h-[700px] flex items-center justify-center overflow-hidden">
        <Image
          src={heroImage}
          alt={place ? `White sand beach and turquoise ocean in ${placeName}, Kenya` : 'White sand beach and turquoise ocean on the Kenyan coast'}
          fill
          className="object-cover"
          priority
          // LCP element. `fetchPriority="high"` + `sizes="100vw"` is the
          // difference between ~4s and <2.5s LCP on 4G mobile — without
          // sizes, next/image can't pick the right srcset candidate and
          // tends to over-fetch.
          fetchPriority="high"
          sizes="100vw"
          // 70 shaves another ~15% off the hero bytes vs. the default 75 with
          // no visible quality loss on the dark gradient overlay we apply —
          // an easy LCP win on 3G/4G African mobile.
          quality={70}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/50" />

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0 60L48 54C96 48 192 36 288 36C384 36 480 48 576 54C672 60 768 60 864 54C960 48 1056 36 1152 30C1248 24 1344 24 1392 24L1440 24V120H1392C1344 120 1248 120 1152 120C1056 120 960 120 864 120C768 120 672 120 576 120C480 120 384 120 288 120C192 120 96 120 48 120H0V60Z"
              fill="white"
            />
          </svg>
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            {heroHeadline.replace(/\.$/, '')}
          </h1>
          <p className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto">
            {heroSubcopy}
          </p>

          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-4 sm:p-6">
            <SearchFilters variant="hero" />
          </div>
        </div>
      </section>

      {/* ===== FEATURED PROPERTIES ===== */}
      {properties.length > 0 && (
        <section className="py-16 lg:py-24 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Featured Properties</h2>
                <p className="mt-2 text-gray-600">
                  Hand-picked stays for an unforgettable {place ? `${placeName} experience` : 'trip to the Kenyan coast'}
                </p>
              </div>
              <Link
                href="/properties"
                className="hidden sm:inline-flex items-center gap-1 text-teal-600 font-semibold hover:text-teal-700 transition-colors"
              >
                View all
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {properties.map((property: any, index: number) => (
                <PropertyCard
                  key={property.id}
                  slug={property.slug}
                  name={property.name}
                  location={property.city || placeName}
                  type={property.property_type?.replace('_', ' ') || 'House'}
                  coverImage={property.images?.[0]?.url || getPropertyImage(index)}
                  rating={property.avg_rating || 0}
                  reviewCount={property.review_count || 0}
                  pricePerNight={property.base_price_per_night}
                  bedrooms={property.bedrooms || 0}
                  bathrooms={property.bathrooms || 0}
                  maxGuests={property.max_guests || 2}
                />
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/properties">
                <Button variant="outline">View all properties</Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ===== FEATURED BOATS ===== */}
      {boats.length > 0 && (
        <section className="py-16 lg:py-24 px-4 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Fishing Charters</h2>
                <p className="mt-2 text-gray-600">World-class deep-sea fishing and coastal excursions</p>
              </div>
              <Link
                href="/boats"
                className="hidden sm:inline-flex items-center gap-1 text-teal-600 font-semibold hover:text-teal-700 transition-colors"
              >
                View all
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {boats.map((boat: any, index: number) => {
                const lowestTrip = boat.trips?.reduce((min: any, t: any) =>
                  !min || t.price_total < min.price_total ? t : min, null);
                return (
                  <BoatCard
                    key={boat.id}
                    slug={boat.slug}
                    name={boat.name}
                    type={boat.boat_type?.replace('_', ' ') || 'Sport Fisher'}
                    coverImage={boat.images?.[0]?.url || getBoatImage(index)}
                    captainName={boat.captain_name || 'TBA'}
                    capacity={boat.capacity}
                    lengthFt={boat.length_ft}
                    rating={boat.avg_rating || 0}
                    reviewCount={boat.review_count || 0}
                    startingPrice={lowestTrip?.price_total || 0}
                    instantConfirmation={boat.instant_confirmation || false}
                  />
                );
              })}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/boats">
                <Button variant="outline">View all boats</Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ===== ABOUT THIS PLACE (long-form prose) =====
          AI search engines (Google SGE, Perplexity, ChatGPT search) need a
          substantive prose block to cite. Keep it single-column, narrative,
          and free of listicle structure — that's what gets pulled verbatim
          into answer boxes. Place.description is the canonical copy; we
          break it into paragraphs on blank lines so it stays readable when
          hosts write longer blurbs. */}
      {place?.description && (
        <section className="py-14 lg:py-20 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              About {placeName}
            </h2>
            <div className="prose prose-lg prose-gray mx-auto">
              {place.description.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className="text-gray-700 leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== WHY THIS PLACE / THINGS TO DO ===== */}
      <section className="py-16 lg:py-24 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">
              {place ? `Things to do in ${placeName}` : "Why Kenya's coast?"}
            </h2>
            <p className="mt-2 text-gray-600 max-w-xl mx-auto">
              {place
                ? `A few of the reasons guests keep coming back to ${placeName}.`
                : 'A world-renowned stretch of coastline offering something for everyone.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {activities.map((item) => (
              <div key={item.title} className="text-center group">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 mb-5 group-hover:bg-teal-100 transition-colors">
                  {item.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WEATHER WIDGET ===== */}
      <WeatherWidget place={place} />

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-16 lg:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
            <p className="mt-2 text-gray-600">
              Three simple steps to your perfect {place ? `${placeName} getaway` : 'coastal getaway'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((item, index) => (
              <div key={item.step} className="relative text-center">
                {index < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] border-t-2 border-dashed border-teal-200" />
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-600 text-white text-xl font-bold mb-5">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LIST YOUR PROPERTY / BOAT CTA ===== */}
      <section className="py-16 lg:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-700 px-8 py-14 sm:px-14 sm:py-20 text-center">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />

            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Earn from your property or boat
              </h2>
              <p className="text-white/80 mb-10 max-w-lg mx-auto text-lg">
                Join {place ? `${placeName}'s` : 'our'} growing community of hosts on the Kenyan
                coast. List your beachfront property or fishing charter and reach travellers from
                around the world.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/become-a-host"
                  className="inline-block bg-white text-teal-700 hover:bg-gray-100 font-semibold text-lg px-8 py-3 rounded-lg transition-colors shadow-lg"
                >
                  List Your Property
                </Link>
                <Link
                  href="/become-a-host"
                  className="inline-block border-2 border-white text-white hover:bg-white/20 font-semibold text-lg px-8 py-3 rounded-lg transition-colors"
                >
                  List Your Boat
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Multi-place shell landing (kwetu.ke root). Funnels guests into a concrete
 * destination before they see any listings, since every search, property,
 * boat and calendar in the rest of the site is scoped to a place.
 */
function ShellLanding({
  host,
  destinations,
}: {
  host: PlaceContext['host'];
  destinations: Place[];
}) {
  // Licensed stock shot (pexels-wijs-wise-136435282); cropped + resized to
  // 2400×1600 and served locally so we're not hotlinking a third-party CDN
  // on the marquee above-the-fold image.
  const shellHero = '/images/hero/kwetu-hero.jpg';
  return (
    <>
      <JsonLd id="ld-org" data={organizationSchema(host)} />
      <JsonLd id="ld-website" data={websiteSchema(host)} />

      {/* HERO — brand-level, no search widget (search is place-scoped) */}
      <section className="relative min-h-[520px] lg:min-h-[620px] flex items-center justify-center overflow-hidden">
        <Image
          src={shellHero}
          alt="White coral sand beach and turquoise ocean on Kenya's coast"
          fill
          className="object-cover"
          priority
          fetchPriority="high"
          sizes="100vw"
          // Same reasoning as the place-scoped hero: 70 is visually
          // indistinguishable under the dark gradient and buys a meaningful
          // LCP improvement on mobile.
          quality={70}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" className="w-full">
            <path d="M0 60L48 54C96 48 192 36 288 36C384 36 480 48 576 54C672 60 768 60 864 54C960 48 1056 36 1152 30C1248 24 1344 24 1392 24L1440 24V120H0V60Z" fill="white" />
          </svg>
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            Your Kenyan coast, simply booked
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto">
            Hand-picked stays, boat charters and local experiences across the
            north coast — Watamu, Kilifi and beyond.
          </p>
          <div className="mt-8 max-w-4xl mx-auto text-left">
            <ShellSearch
              destinations={destinations.map((d) => ({ slug: d.slug, name: d.name }))}
            />
          </div>
          <a
            href="#destinations"
            className="mt-6 inline-flex items-center gap-2 text-white/90 hover:text-white text-sm font-medium"
          >
            Or browse destinations
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </a>
        </div>
      </section>

      {/* DESTINATIONS */}
      <section id="destinations" className="py-16 lg:py-24 px-4 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Pick your destination</h2>
            <p className="mt-2 text-gray-600 max-w-xl mx-auto">
              Each {host.brand_short} destination has its own stays, boats,
              tides, and local guides. Pick one to start.
            </p>
          </div>

          {destinations.length === 0 ? (
            <p className="text-center text-gray-500">No destinations available yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {destinations.map((dest) => (
                <DestinationCardLink
                  key={dest.id}
                  slug={dest.slug}
                  className="group relative block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 hover:shadow-xl transition-all"
                >
                  <div className="relative h-64 w-full overflow-hidden">
                    <Image
                      src={dest.hero_image_url ?? STOCK_IMAGES.placeholder}
                      alt={`${dest.name} hero`}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    {dest.visibility === 'preview' && (
                      <span className="absolute top-3 right-3 bg-amber-400 text-amber-950 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded">
                        Preview
                      </span>
                    )}
                    <div className="absolute bottom-4 left-4 right-4 text-white">
                      <h3 className="text-2xl font-bold">{dest.name}</h3>
                      {dest.short_tagline && (
                        <p className="text-sm text-white/85 line-clamp-1">{dest.short_tagline}</p>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    {dest.description && (
                      <p className="text-sm text-gray-600 line-clamp-3">{dest.description}</p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {dest.features.slice(0, 4).map((f) => (
                        <span
                          key={f}
                          className="inline-block text-[11px] font-medium uppercase tracking-wide text-teal-700 bg-teal-50 px-2 py-1 rounded"
                        >
                          {FEATURE_LABELS[f] ?? f}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 inline-flex items-center gap-1 text-teal-600 font-semibold text-sm group-hover:text-teal-700">
                      Explore {dest.name}
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </div>
                </DestinationCardLink>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-16 lg:py-24 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">How {host.brand_short} works</h2>
            <p className="mt-2 text-gray-600">Three simple steps to your perfect Kenya coast getaway</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((item, index) => (
              <div key={item.step} className="relative text-center">
                {index < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] border-t-2 border-dashed border-teal-200" />
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-600 text-white text-xl font-bold mb-5">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOST CTA */}
      <section className="py-16 lg:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-700 px-8 py-14 sm:px-14 sm:py-20 text-center">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Host with {host.brand_name}
              </h2>
              <p className="text-white/85 mb-10 max-w-lg mx-auto text-lg">
                List your property or boat and reach travellers looking to
                explore the Kenyan coast.
              </p>
              <Link
                href="/become-a-host"
                className="inline-block bg-white text-teal-700 hover:bg-gray-100 font-semibold text-lg px-8 py-3 rounded-lg transition-colors shadow-lg"
              >
                Become a host
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
