import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import BoatCard from "@/components/BoatCard";
import SearchFilters from "@/components/SearchFilters";
import SortSelect from "@/components/SortSelect";
import { getBoatImage } from "@/lib/images";
import { getCurrentPlace, resolvePlaceSlugs, listActivePlaces } from "@/lib/places/context";
import type { Boat, Place } from "@/lib/types";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { place } = await getCurrentPlace();
  const placeLabel = place?.name ?? 'Kenya';
  return {
    title: place
      ? `Fishing Boats & Charters in ${placeLabel}`
      : `Fishing Boats & Charters on the Kenyan Coast`,
    description: place
      ? `Book deep-sea fishing charters and boat trips in ${placeLabel}, Kenya. Target marlin, sailfish, tuna, and more with experienced local captains.`
      : `Book deep-sea fishing charters and boat trips on Kenya's coast. Target marlin, sailfish, tuna, and more with experienced local captains.`,
  };
}

interface SearchParams {
  boat_type?: string;
  trip_type?: string;
  min_price?: string;
  max_price?: string;
  capacity?: string;
  /** Comma-separated destination slugs; overrides the path-resolved place. */
  places?: string;
  sort?: string;
  page?: string;
}

const PAGE_SIZE = 12;

async function getBoats(
  searchParams: SearchParams,
  place: Place | null,
  selectedPlaces: Place[] | null
) {
  const supabase = await createServerClient();

  // Build base select; when a place is active we inner-join wb_boat_places so the
  // count is returned correctly over the join.
  const selectColumns = `
      *,
      images:wb_images(id, url, alt_text, sort_order),
      reviews:wb_reviews(rating),
      trips:wb_boat_trips(id, name, trip_type, duration_hours, price_total, description)
    `;

  // Explicit ?places= wins over the path-resolved place. Empty = no scope.
  const scope =
    selectedPlaces && selectedPlaces.length > 0
      ? selectedPlaces
      : place
        ? [place]
        : [];

  let query: any;
  if (scope.length > 0) {
    const joinFragment = 'wb_boat_places!inner(place_id, is_primary)';
    query = supabase
      .from("wb_boats")
      .select(`${selectColumns}, ${joinFragment}`, { count: "exact" })
      .in(
        "wb_boat_places.place_id",
        scope.map((p) => p.id)
      )
      .eq("is_published", true)
      .eq("is_test", false);
  } else {
    query = supabase
      .from("wb_boats")
      .select(selectColumns, { count: "exact" })
      .eq("is_published", true)
      .eq("is_test", false);
  }

  // Filters
  if (searchParams.boat_type) {
    query = query.eq("boat_type", searchParams.boat_type);
  }
  if (searchParams.capacity) {
    query = query.gte("capacity", Number(searchParams.capacity));
  }

  // Trip-type filtering — if the user filters by trip type, we need boats that
  // offer that kind of trip. We do a sub-query to find matching boat IDs.
  if (searchParams.trip_type) {
    let tripQuery = supabase.from("wb_boat_trips").select("boat_id");

    // "half_day" matches half_day, half_day_morning, and half_day_afternoon
    if (searchParams.trip_type === "half_day") {
      tripQuery = tripQuery.in("trip_type", ["half_day", "half_day_morning", "half_day_afternoon"]);
    } else {
      tripQuery = tripQuery.eq("trip_type", searchParams.trip_type);
    }

    const { data: matchingBoatIds } = await tripQuery;

    if (matchingBoatIds && matchingBoatIds.length > 0) {
      const ids = [...new Set(matchingBoatIds.map((r) => r.boat_id))];
      query = query.in("id", ids);
    } else {
      // No boats match — short-circuit
      return { boats: [] as Boat[], total: 0, page: 1 };
    }
  }

  // Sort
  switch (searchParams.sort) {
    case "price_asc":
    case "price_desc":
      // Price sorting done client-side since prices are in trips table
      query = query.order("created_at", { ascending: false });
      break;
    case "rating":
      query = query.order("avg_rating", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });
  }

  // Pagination
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching boats:", error);
    return { boats: [] as Boat[], total: 0, page };
  }

  let boats = (data ?? []) as Boat[];

  // F6: trip prices live on wb_boat_trips, so price sort has to run client-side
  // after the Supabase fetch. Rating/newest/default already handled above.
  if (searchParams.sort === "price_asc" || searchParams.sort === "price_desc") {
    const startingPrice = (b: any) =>
      Array.isArray(b?.trips) && b.trips.length > 0
        ? Math.min(
            ...b.trips.map((t: any) => Number(t.price_total) || Infinity)
          )
        : Infinity;
    const dir = searchParams.sort === "price_asc" ? 1 : -1;
    boats = [...boats].sort((a, b) => (startingPrice(a) - startingPrice(b)) * dir);
  }

  return { boats, total: count ?? 0, page };
}

export default async function BoatsPage({
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
  // Feature gate: a place without the "boats" feature (inland, city, etc.)
  // doesn't get the boats route. Multi-place shell (place == null) still
  // shows the global boats index. When the user has explicitly picked a set
  // of destinations via ?places=, honour that even if the path place doesn't
  // support boats.
  if (place && !place.features.includes('boats') && !selectedPlaces) notFound();
  const { boats, total, page } = await getBoats(params, place, selectedPlaces);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const placeName = (() => {
    if (selectedPlaces && selectedPlaces.length === 1) return selectedPlaces[0]!.name;
    if (selectedPlaces && selectedPlaces.length > 1) {
      return selectedPlaces.map((p) => p.name).join(' & ');
    }
    return place?.name ?? 'Kenyan';
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-[var(--color-primary-100)] bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-sandy-50)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--color-primary-200)] opacity-30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--color-sandy-200)] opacity-30 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-14">
          <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-primary-700)]">
            Fishing &amp; cruises
          </span>
          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">Boats &amp; charters</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Deep-sea fishing, reef trips, and coastal excursions with experienced {placeName} captains.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <SearchFilters
            variant="boats"
            destinations={activePlaces.map((p) => ({ slug: p.slug, name: p.name }))}
            currentPlaceSlug={place?.slug ?? null}
            initial={{ places: params.places }}
          />
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Results count and sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <p className="text-gray-700 font-medium">
            {total === 0 ? "No boats found" : `${total} boat${total === 1 ? "" : "s"} found`}
          </p>

          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-sm text-gray-600 whitespace-nowrap">
              Sort by:
            </label>
            <SortSelect current={params.sort} />
          </div>
        </div>

        {/* Boat grid */}
        {boats.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {boats.map((boat: any, index: number) => (
              <BoatCard
                key={boat.id}
                slug={boat.slug}
                name={boat.name}
                type={boat.boat_type?.replace('_', ' ') || 'Sport Fisher'}
                coverImage={boat.images?.[0]?.url || getBoatImage(index)}
                captainName={boat.captain_name || 'TBA'}
                capacity={boat.capacity || 6}
                lengthFt={boat.length_ft || null}
                rating={Number(boat.avg_rating) || 0}
                reviewCount={boat.review_count || 0}
                startingPrice={
                  Array.isArray(boat.trips) && boat.trips.length > 0
                    ? Math.min(...boat.trips.map((t: any) => Number(t.price_total) || Infinity))
                    : 0
                }
                currency={boat.currency || 'KES'}
                instantConfirmation={boat.instant_confirmation || false}
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

/* ---------- Sub-components ---------- */

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No boats found</h3>
      <p className="text-gray-600 max-w-md mx-auto">
        Try adjusting your filters. New boats and charters are added regularly.
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
    return `/boats?${params.toString()}`;
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
