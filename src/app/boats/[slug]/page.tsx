import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient as createServerClient } from "@/lib/supabase/server";
import ImageGallery from "@/components/ImageGallery";
import ReviewCard from "@/components/ReviewCard";
import StarRating from "@/components/StarRating";
import { Badge } from "@/components/ui/Badge";
import BoatBookingSidebar from "./BoatBookingSidebar";
import type { Boat, BoatTrip, Review, Image } from "@/lib/types";

/* ---------- Types ---------- */

interface BoatFeature {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

interface BoatDetail extends Boat {
  images: Image[];
  trips: BoatTrip[];
  reviews: Review[];
  features: { feature: BoatFeature }[];
  owner: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    created_at: string;
  } | null;
}

/* ---------- Data ---------- */

async function getBoat(slug: string): Promise<BoatDetail | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("wb_boats")
    .select(
      `
      *,
      images:wb_images(id, url, alt, position),
      trips:wb_boat_trips(id, name, trip_type, duration_hours, price, description, max_guests, includes),
      reviews:wb_reviews(
        id, rating, comment, created_at,
        author:profiles(id, full_name, avatar_url)
      ),
      features:wb_boat_feature_links(feature:wb_boat_features(id, name, icon, category)),
      owner:profiles!wb_boats_owner_id_fkey(id, full_name, avatar_url, created_at)
    `
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) return null;
  return data as unknown as BoatDetail;
}

async function getBoatAvailability(boatId: string) {
  const supabase = await createServerClient();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("wb_boat_availability")
    .select("date, is_available")
    .eq("boat_id", boatId)
    .gte("date", today)
    .order("date", { ascending: true });

  return data ?? [];
}

/* ---------- Metadata ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const boat = await getBoat(slug);
  if (!boat) return { title: "Boat Not Found" };

  const cover = boat.images?.sort((a, b) => a.position - b.position)[0];

  return {
    title: boat.name,
    description: boat.description?.slice(0, 160),
    openGraph: {
      title: boat.name,
      description: boat.description?.slice(0, 160),
      images: cover ? [{ url: cover.url, alt: cover.alt ?? boat.name }] : [],
    },
  };
}

/* ---------- Page ---------- */

export default async function BoatDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const boat = await getBoat(slug);
  if (!boat) notFound();

  const availability = await getBoatAvailability(boat.id);

  const sortedImages = (boat.images ?? []).sort((a, b) => a.position - b.position);
  const trips = boat.trips ?? [];
  const reviews = boat.reviews ?? [];
  const features = (boat.features ?? []).map((f) => f.feature);

  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));

  // Group features by category
  const featuresByCategory = features.reduce<Record<string, BoatFeature[]>>((acc, f) => {
    const cat = f.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  // Spec items
  const specs = [
    { label: "Type", value: boat.boat_type },
    { label: "Length", value: boat.length ? `${boat.length} ft` : null },
    { label: "Capacity", value: boat.capacity ? `${boat.capacity} guests` : null },
    { label: "Crew", value: boat.crew_size ? `${boat.crew_size} crew` : null },
    { label: "Captain", value: boat.captain_name },
    { label: "Engine", value: boat.engine },
    { label: "Year Built", value: boat.year_built },
  ].filter((s) => s.value);

  return (
    <div className="min-h-screen bg-white">
      {/* Image gallery */}
      <ImageGallery images={sortedImages} alt={boat.name} />

      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
        <div className="lg:grid lg:grid-cols-3 lg:gap-12">
          {/* ===== Main content (2/3) ===== */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {boat.boat_type && <Badge variant="secondary">{boat.boat_type}</Badge>}
                {boat.is_featured && <Badge variant="default">Featured</Badge>}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                {boat.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-gray-600">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  Watamu, Kenya
                </span>
                {totalReviews > 0 && (
                  <span className="flex items-center gap-1">
                    <StarRating rating={averageRating} />
                    <span className="font-medium">{averageRating.toFixed(1)}</span>
                    <span className="text-gray-400">
                      ({totalReviews} review{totalReviews !== 1 ? "s" : ""})
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">About this boat</h2>
              <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                {boat.description}
              </div>
            </section>

            {/* Boat specs */}
            {specs.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Specifications</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="bg-gray-50 rounded-xl p-4 text-center"
                    >
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                        {spec.label}
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{spec.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Features */}
            {features.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Features &amp; Equipment
                </h2>
                {Object.entries(featuresByCategory).map(([category, items]) => (
                  <div key={category} className="mb-4">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                      {category}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {items.map((feature) => (
                        <span
                          key={feature.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-50 text-cyan-800 text-sm"
                        >
                          {feature.icon && <span>{feature.icon}</span>}
                          {feature.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Trip packages */}
            {trips.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Trip Packages</h2>
                <div className="space-y-4">
                  {trips.map((trip) => (
                    <div
                      key={trip.id}
                      className="border border-gray-200 rounded-xl p-5 hover:border-teal-300 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{trip.name}</h3>
                            {trip.trip_type && (
                              <Badge variant="outline" className="text-xs">
                                {trip.trip_type}
                              </Badge>
                            )}
                          </div>
                          {trip.description && (
                            <p className="text-sm text-gray-600 mb-2">{trip.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                            {trip.duration_hours && (
                              <span>
                                {trip.duration_hours} hour{trip.duration_hours !== 1 ? "s" : ""}
                              </span>
                            )}
                            {trip.max_guests && (
                              <span>Up to {trip.max_guests} guests</span>
                            )}
                          </div>
                          {trip.includes && (
                            <p className="text-xs text-gray-500 mt-2">
                              <span className="font-medium">Includes:</span> {trip.includes}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold text-teal-700">
                            KES {trip.price.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-400">per trip</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Target species and techniques */}
            {(boat.target_species || boat.fishing_techniques) && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Fishing Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {boat.target_species && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Target Species
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(boat.target_species)
                          ? boat.target_species
                          : boat.target_species.split(",").map((s: string) => s.trim())
                        ).map((species: string) => (
                          <span
                            key={species}
                            className="inline-block px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm"
                          >
                            {species}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {boat.fishing_techniques && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Techniques
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(boat.fishing_techniques)
                          ? boat.fishing_techniques
                          : boat.fishing_techniques.split(",").map((s: string) => s.trim())
                        ).map((technique: string) => (
                          <span
                            key={technique}
                            className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm"
                          >
                            {technique}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Captain info */}
            {boat.captain_name && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Captain</h2>
                <div className="flex items-start gap-4 bg-gray-50 rounded-xl p-5">
                  {boat.captain_image_url ? (
                    <img
                      src={boat.captain_image_url}
                      alt={boat.captain_name}
                      className="w-16 h-16 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xl shrink-0">
                      {boat.captain_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">
                      Captain {boat.captain_name}
                    </p>
                    {boat.captain_bio && (
                      <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                        {boat.captain_bio}
                      </p>
                    )}
                    {boat.captain_experience_years && (
                      <p className="text-sm text-gray-500 mt-2">
                        {boat.captain_experience_years}+ years of experience
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Reviews */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Reviews
                {totalReviews > 0 && (
                  <span className="text-gray-400 font-normal ml-2 text-base">
                    ({totalReviews})
                  </span>
                )}
              </h2>

              {totalReviews > 0 ? (
                <>
                  {/* Rating summary */}
                  <div className="flex flex-col sm:flex-row gap-8 mb-8 p-6 bg-gray-50 rounded-xl">
                    <div className="text-center sm:text-left">
                      <p className="text-5xl font-bold text-gray-900">
                        {averageRating.toFixed(1)}
                      </p>
                      <StarRating rating={averageRating} size="lg" />
                      <p className="text-sm text-gray-500 mt-1">
                        {totalReviews} review{totalReviews !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {ratingDistribution.map(({ star, count }) => (
                        <div key={star} className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 w-4">{star}</span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{
                                width:
                                  totalReviews > 0
                                    ? `${(count / totalReviews) * 100}%`
                                    : "0%",
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-400 w-6 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Review cards */}
                  <div className="space-y-6">
                    {reviews.map((review) => (
                      <ReviewCard key={review.id} review={review} />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-gray-500">
                  No reviews yet. Be the first to share your experience!
                </p>
              )}
            </section>
          </div>

          {/* ===== Sidebar (1/3) ===== */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Booking form */}
              <BoatBookingSidebar
                boatId={boat.id}
                boatSlug={boat.slug}
                trips={trips}
                capacity={boat.capacity}
                availability={availability}
              />

              {/* Owner info */}
              {boat.owner && (
                <div className="border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Boat owner</h3>
                  <div className="flex items-center gap-3">
                    {boat.owner.avatar_url ? (
                      <img
                        src={boat.owner.avatar_url}
                        alt={boat.owner.full_name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg">
                        {boat.owner.full_name?.charAt(0)?.toUpperCase() || "O"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{boat.owner.full_name}</p>
                      <p className="text-sm text-gray-500">
                        Member since{" "}
                        {new Date(boat.owner.created_at).toLocaleDateString("en-GB", {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
