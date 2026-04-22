import { createClient as createServerClient } from "@/lib/supabase/server";
import PropertyCard from "@/components/PropertyCard";
import SearchFilters from "@/components/SearchFilters";
import SortSelect from "@/components/SortSelect";
import { getPropertyImage } from "@/lib/images";
import { getCurrentPlace, resolvePlaceSlugs, listActivePlaces } from "@/lib/places/context";
import { filterPropertiesByPlace, filterPropertiesByPlaces } from "@/lib/places/queries";
import type { Place, Property } from "@/lib/types";
import type { Metadata } from "next";
import { resolveFlexiConfig, computeFlexiPrice, daysUntil } from "@/lib/flexi";
import TrackView from "@/lib/analytics/TrackView";

export async function generateMetadata(): Promise<Metadata> {
  const { place } = await getCurrentPlace();
  // On the multi-place shell (no resolved place) fall back to a generic
  // "Kenyan coast" label — "Properties in Kwetu" reads awkwardly because
  // Kwetu is the brand, not a place.
  const placeLabel = place?.name ?? 'the Kenyan coast';
  return {
    title: place ? `Properties in ${placeLabel}` : `Properties on ${placeLabel}`,
    description: place
      ? `Browse and book beachfront villas, apartments, and holiday homes in ${placeLabel}, Kenya. Filter by price, bedrooms, guests, and more.`
      : `Browse and book beachfront villas, apartments, and holiday homes on Kenya's coast. Filter by price, bedrooms, guests, and more.`,
  };
}

interface SearchParams {
  property_type?: string;
  min_price?: string;
  max_price?: string;
  bedrooms?: string;
  guests?: string;
  check_in?: string;
  check_out?: string;
  amenities?: string;
  /**
   * Comma-separated destination slugs (e.g. "watamu,kilifi"). When set,
   * overrides the path-scoped place so users can search across destinations.
   */
  places?: string;
  /** "1" to filter to properties with an active last-minute (flexi) discount. */
  last_minute?: string;
  sort?: string;
  page?: string;
}

const PAGE_SIZE = 12;

async function getAmenities() {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("wb_amenities")
    .select("id, name, icon, category")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  return data ?? [];
}

async function getProperties(
  searchParams: SearchParams,
  place: Place | null,
  selectedPlaces: Place[] | null
) {
  const supabase = await createServerClient();

  let query = supabase
    .from("wb_properties")
    .select(
      `
      *,
      images:wb_images(id, url, alt_text, sort_order),
      reviews:wb_reviews(rating),
      owner:wb_profiles!wb_properties_owner_id_fkey(flexi_default_enabled, flexi_default_window_days, flexi_default_cutoff_days, flexi_default_floor_percent)
    `,
      { count: "exact" }
    )
    .eq("is_published", true)
    .eq("is_test", false);

  // Last-minute-only filter: scope to flexi-enabled properties at the DB
  // layer. Further refinement (actually within window for selected dates)
  // happens in-memory after fetch.
  if (searchParams.last_minute === '1') {
    query = query.eq('flexi_enabled', true);
  }

  // If the user explicitly picked a set of destinations via ?places=, honour
  // that. Otherwise scope to the current path-resolved place.
  if (selectedPlaces && selectedPlaces.length > 0) {
    query = filterPropertiesByPlaces(query, selectedPlaces);
  } else {
    query = filterPropertiesByPlace(query, place);
  }

  // Apply filters
  if (searchParams.property_type) {
    query = query.eq("property_type", searchParams.property_type);
  }
  if (searchParams.min_price) {
    query = query.gte("base_price_per_night", Number(searchParams.min_price));
  }
  if (searchParams.max_price) {
    query = query.lte("base_price_per_night", Number(searchParams.max_price));
  }
  if (searchParams.bedrooms) {
    query = query.gte("bedrooms", Number(searchParams.bedrooms));
  }
  if (searchParams.guests) {
    query = query.gte("max_guests", Number(searchParams.guests));
  }

  // Amenity intersect filter: only include properties that have ALL requested
  // amenities attached via the junction table. We do this by pulling the
  // property_ids that match and restricting the main query to that set.
  const amenityIds = (searchParams.amenities ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (amenityIds.length > 0) {
    const { data: links } = await supabase
      .from("wb_property_amenities")
      .select("property_id, amenity_id")
      .in("amenity_id", amenityIds);

    const countByProperty: Record<string, number> = {};
    (links ?? []).forEach((r: { property_id: string; amenity_id: string }) => {
      countByProperty[r.property_id] = (countByProperty[r.property_id] ?? 0) + 1;
    });
    const matchingIds = Object.keys(countByProperty).filter(
      (pid) => countByProperty[pid] === amenityIds.length
    );

    if (matchingIds.length === 0) {
      // No property has all selected amenities — short-circuit.
      return { properties: [] as Property[], total: 0, page: Math.max(1, Number(searchParams.page) || 1) };
    }
    query = query.in("id", matchingIds);
  }

  // Date availability filtering: exclude properties that have blocked dates
  // within the requested range
  if (searchParams.check_in && searchParams.check_out) {
    const { data: unavailableIds } = await supabase
      .from("wb_availability")
      .select("property_id")
      .gte("date", searchParams.check_in)
      .lte("date", searchParams.check_out)
      .eq("is_blocked", true);

    if (unavailableIds && unavailableIds.length > 0) {
      const excludeIds = [...new Set(unavailableIds.map((r) => r.property_id))];
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }
  }

  // Sort
  switch (searchParams.sort) {
    case "price_asc":
      query = query.order("base_price_per_night", { ascending: true });
      break;
    case "price_desc":
      query = query.order("base_price_per_night", { ascending: false });
      break;
    case "rating":
      query = query.order("avg_rating", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  }

  // Pagination
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching properties:", error);
    return { properties: [] as PropertyWithFlexi[], total: 0, page };
  }

  // Decorate each property with an effective flexi price per night for the
  // selected dates (if any), then optionally filter to only those where the
  // discount is actually active during the requested window.
  const decorated: PropertyWithFlexi[] = (data ?? []).map((p: any) => {
    const owner = Array.isArray(p.owner) ? p.owner[0] : p.owner;
    const flexi = resolveFlexiConfig(p, owner ?? null);
    let flexi_price_per_night: number | null = null;
    let is_last_minute = false;
    if (flexi.enabled && searchParams.check_in) {
      const r = computeFlexiPrice(
        Number(p.base_price_per_night) || 0,
        flexi,
        searchParams.check_in,
      );
      if (!r.pastCutoff && r.isLastMinute) {
        flexi_price_per_night = r.effectivePrice;
        is_last_minute = true;
      } else if (r.pastCutoff) {
        // Past cutoff → unbookable; hide it from last-minute results.
        is_last_minute = false;
      }
    }
    return { ...p, _flexi: flexi, flexi_price_per_night, is_last_minute };
  });

  let filtered = decorated;
  let total = count ?? 0;
  if (searchParams.last_minute === '1' && searchParams.check_in) {
    // With dates selected, only show properties where the discount is
    // actually active for the chosen check-in. Count reflects this page's
    // post-filter size; pagination for last-minute + dates is best-effort.
    filtered = decorated.filter((p) => p.is_last_minute);
    total = filtered.length;
  }

  return { properties: filtered, total, page };
}

type PropertyWithFlexi = Property & {
  owner?: unknown;
  _flexi?: ReturnType<typeof resolveFlexiConfig>;
  flexi_price_per_night?: number | null;
  is_last_minute?: boolean;
};

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [{ place }, selectedPlaces, activePlaces] = await Promise.all([
    getCurrentPlace(),
    resolvePlaceSlugs(params.places),
    listActivePlaces(),
  ]);
  const [{ properties, total, page }, amenities] = await Promise.all([
    getProperties(params, place, selectedPlaces),
    getAmenities(),
  ]);
  // Heading label: picked destinations override path place, and "all" shows
  // the broad Kenyan-coast label rather than a single-place name.
  const placeName = (() => {
    if (selectedPlaces && selectedPlaces.length === 1) return selectedPlaces[0]!.name;
    if (selectedPlaces && selectedPlaces.length > 1) {
      return selectedPlaces.map((p) => p.name).join(' & ');
    }
    return place?.name ?? 'the Kenyan coast';
  })();
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const selectedAmenities = (params.amenities ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* One-shot search_view event — landed the page, not necessarily a search query. */}
      <TrackView
        event="search_view"
        payload={{
          placeSlug: place?.slug ?? null,
          resultCount: properties.length,
          hasFilters: Boolean(
            params.check_in ||
              params.check_out ||
              params.guests ||
              params.property_type ||
              params.min_price ||
              params.max_price ||
              params.amenities ||
              params.last_minute,
          ),
        }}
      />
      {/* Header */}
      <div className="relative overflow-hidden border-b border-[var(--color-primary-100)] bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-sandy-50)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--color-primary-200)] opacity-30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--color-sandy-200)] opacity-30 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-14">
          <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-primary-700)]">
            Stays
          </span>
          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            {placeName === 'the Kenyan coast' ? 'Properties on the Kenyan coast' : `Properties in ${placeName}`}
          </h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Beachfront villas, apartments, and holiday homes on the Kenyan coast — all vetted by local hosts.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <SearchFilters
            variant="properties"
            amenities={amenities}
            destinations={activePlaces.map((p) => ({ slug: p.slug, name: p.name }))}
            currentPlaceSlug={place?.slug ?? null}
            initial={{
              check_in: params.check_in,
              check_out: params.check_out,
              guests: params.guests,
              property_type: params.property_type,
              min_price: params.min_price,
              max_price: params.max_price,
              amenities: selectedAmenities,
              places: params.places,
              last_minute: params.last_minute,
            }}
          />
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Results count and sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <p className="text-gray-700 font-medium">
            {total === 0 ? "No properties found" : `${total} propert${total === 1 ? "y" : "ies"} found`}
          </p>

          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-sm text-gray-600 whitespace-nowrap">
              Sort by:
            </label>
            <SortSelect current={params.sort} />
          </div>
        </div>

        {/* Property grid */}
        {properties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {properties.map((property: any, index: number) => (
              <PropertyCard
                key={property.id}
                slug={property.slug}
                name={property.name}
                location={property.city || placeName}
                type={property.property_type?.replace('_', ' ') || 'House'}
                coverImage={property.images?.[0]?.url || getPropertyImage(index)}
                rating={Number(property.avg_rating) || 0}
                reviewCount={property.review_count || 0}
                pricePerNight={Number(property.base_price_per_night) || 0}
                bedrooms={property.bedrooms || 0}
                bathrooms={property.bathrooms || 0}
                maxGuests={property.max_guests || 2}
                flexiPricePerNight={property.flexi_price_per_night ?? null}
                isLastMinuteEligible={
                  Boolean(property.flexi_enabled) &&
                  (params.last_minute === '1' || Boolean(property.is_last_minute))
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination currentPage={page} totalPages={totalPages} searchParams={params} />
        )}
      </div>
    </div>
  );
}

/* ---------- Client-interactive sub-components ---------- */

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No properties found</h3>
      <p className="text-gray-600 max-w-md mx-auto">
        Try adjusting your filters or search for different dates. New properties are added regularly.
      </p>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: SearchParams;
}) {
  function buildHref(page: number) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && key !== "page") params.set(key, value);
    });
    params.set("page", String(page));
    return `/properties?${params.toString()}`;
  }

  const pages: (number | "ellipsis")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-12" aria-label="Pagination">
      {currentPage > 1 && (
        <a
          href={buildHref(currentPage - 1)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Previous
        </a>
      )}
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-2 text-gray-400">
            ...
          </span>
        ) : (
          <a
            key={p}
            href={buildHref(p)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              p === currentPage
                ? "bg-teal-600 text-white border-teal-600"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p}
          </a>
        )
      )}
      {currentPage < totalPages && (
        <a
          href={buildHref(currentPage + 1)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Next
        </a>
      )}
    </nav>
  );
}
