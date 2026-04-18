import { createClient as createServerClient } from "@/lib/supabase/server";
import BoatCard from "@/components/BoatCard";
import SearchFilters from "@/components/SearchFilters";
import { getBoatImage } from "@/lib/images";
import type { Boat } from "@/lib/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fishing Boats & Charters in Watamu",
  description:
    "Book deep-sea fishing charters and boat trips in Watamu, Kenya. Target marlin, sailfish, tuna, and more with experienced local captains.",
};

interface SearchParams {
  boat_type?: string;
  trip_type?: string;
  min_price?: string;
  max_price?: string;
  capacity?: string;
  sort?: string;
  page?: string;
}

const PAGE_SIZE = 12;

async function getBoats(searchParams: SearchParams) {
  const supabase = await createServerClient();

  let query = supabase
    .from("wb_boats")
    .select(
      `
      *,
      images:wb_images(id, url, alt, position),
      reviews:wb_reviews(rating),
      trips:wb_boat_trips(id, name, trip_type, duration_hours, price, description)
    `,
      { count: "exact" }
    )
    .eq("is_published", true);

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

  // Price range filtering on the base (cheapest trip) price
  if (searchParams.min_price) {
    query = query.gte("price_from", Number(searchParams.min_price));
  }
  if (searchParams.max_price) {
    query = query.lte("price_from", Number(searchParams.max_price));
  }

  // Sort
  switch (searchParams.sort) {
    case "price_asc":
      query = query.order("price_from", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price_from", { ascending: false });
      break;
    case "rating":
      query = query.order("average_rating", { ascending: false, nullsFirst: false });
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

  return { boats: (data ?? []) as Boat[], total: count ?? 0, page };
}

export default async function BoatsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { boats, total, page } = await getBoats(params);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-900">Fishing Boats &amp; Charters</h1>
          <p className="mt-2 text-gray-600">
            Deep-sea fishing, reef trips, and coastal excursions with experienced Watamu captains
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <SearchFilters variant="boats" />
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
                rating={boat.average_rating || boat.avg_rating || 0}
                reviewCount={boat.review_count || 0}
                startingPrice={boat.price_from || (boat.trips?.[0]?.price_total) || 0}
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

function SortSelect({ current }: { current?: string }) {
  return (
    <form>
      <select
        name="sort"
        defaultValue={current || ""}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <option value="">Recommended</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="rating">Top Rated</option>
        <option value="newest">Newest</option>
      </select>
      <noscript>
        <button type="submit" className="ml-2 text-sm text-teal-600 underline">
          Apply
        </button>
      </noscript>
    </form>
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
