import { createClient as createServerClient } from "@/lib/supabase/server";
import PropertyCard from "@/components/PropertyCard";
import SearchFilters from "@/components/SearchFilters";
import { getPropertyImage } from "@/lib/images";
import type { Property } from "@/lib/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Properties in Watamu",
  description:
    "Browse and book beachfront villas, apartments, and holiday homes in Watamu, Kenya. Filter by price, bedrooms, guests, and more.",
};

interface SearchParams {
  property_type?: string;
  min_price?: string;
  max_price?: string;
  bedrooms?: string;
  guests?: string;
  check_in?: string;
  check_out?: string;
  sort?: string;
  page?: string;
}

const PAGE_SIZE = 12;

async function getProperties(searchParams: SearchParams) {
  const supabase = await createServerClient();

  let query = supabase
    .from("wb_properties")
    .select(
      `
      *,
      images:wb_images(id, url, alt_text, sort_order),
      reviews:wb_reviews(rating)
    `,
      { count: "exact" }
    )
    .eq("is_published", true);

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
    return { properties: [] as Property[], total: 0, page };
  }

  return { properties: (data ?? []) as Property[], total: count ?? 0, page };
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { properties, total, page } = await getProperties(params);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-[var(--color-primary-100)] bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-sandy-50)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--color-primary-200)] opacity-30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--color-sandy-200)] opacity-30 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-14">
          <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-primary-700)]">
            Stays
          </span>
          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">Properties in Watamu</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Beachfront villas, apartments, and holiday homes on the Kenyan coast — all vetted by local hosts.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <SearchFilters variant="properties" />
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
                location={property.city || 'Watamu'}
                type={property.property_type?.replace('_', ' ') || 'House'}
                coverImage={property.images?.[0]?.url || getPropertyImage(index)}
                rating={Number(property.avg_rating) || 0}
                reviewCount={property.review_count || 0}
                pricePerNight={Number(property.base_price_per_night) || 0}
                currency={property.currency || 'KES'}
                bedrooms={property.bedrooms || 0}
                bathrooms={property.bathrooms || 0}
                maxGuests={property.max_guests || 2}
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

function SortSelect({ current }: { current?: string }) {
  return (
    <form>
      <select
        name="sort"
        defaultValue={current || ""}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        // Using native form submission for server component compatibility
        onChange={undefined}
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
