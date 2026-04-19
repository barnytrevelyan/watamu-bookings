import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient as createServerClient } from "@/lib/supabase/server";
import ImageGallery from "@/components/ImageGallery";
import ReviewCard from "@/components/ReviewCard";
import StarRating from "@/components/StarRating";
import { Badge } from "@/components/ui/Badge";
import BoatBookingSidebar from "./BoatBookingSidebar";
import type { Boat, BoatTrip, Review, Image, TripType } from "@/lib/types";
import { TRIP_TYPE_LABELS, MONTH_LABELS } from "@/lib/types";

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
      images:wb_images(id, url, alt_text, sort_order),
      trips:wb_boat_trips(id, name, trip_type, duration_hours, price_total, price_per_person, description, max_guests, includes, departure_time, target_species, seasonal_months),
      reviews:wb_reviews(
        id, rating, comment, created_at, is_verified, reported_catch, trip_name,
        boat_equipment_rating, captain_crew_rating, fishing_experience_rating,
        author:wb_profiles(id, full_name, avatar_url)
      ),
      features:wb_boat_feature_links(feature:wb_boat_features(id, name, icon, category)),
      owner:wb_profiles!wb_boats_owner_id_fkey(id, full_name, avatar_url, created_at)
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
    .select("date, is_blocked")
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

  const cover = boat.images?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];

  return {
    title: boat.name,
    description: boat.description?.slice(0, 160),
    openGraph: {
      title: boat.name,
      description: boat.description?.slice(0, 160),
      images: cover ? [{ url: cover.url, alt: cover.alt_text ?? boat.name }] : [],
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

  const sortedImages = (boat.images ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const trips = boat.trips ?? [];
  const reviews = boat.reviews ?? [];
  const features = (boat.features ?? []).map((f) => f.feature);

  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0 ? reviews.reduce((sum, r: any) => sum + r.rating, 0) / totalReviews : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r: any) => Math.round(r.rating) === star).length,
  }));

  // Multi-dimensional rating averages for boats
  const boatSubRatings = (() => {
    const withBoatRatings = reviews.filter((r: any) => r.boat_equipment_rating);
    if (withBoatRatings.length === 0) return null;
    const avg = (field: string) => {
      const vals = withBoatRatings.filter((r: any) => r[field]).map((r: any) => r[field]);
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
    };
    return [
      { label: 'Boat & Equipment', score: avg('boat_equipment_rating') },
      { label: 'Captain & Crew', score: avg('captain_crew_rating') },
      { label: 'Fishing Experience', score: avg('fishing_experience_rating') },
    ];
  })();

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
    { label: "Length", value: boat.length_ft ? `${boat.length_ft} ft` : null },
    { label: "Capacity", value: boat.capacity ? `${boat.capacity} guests` : null },
    { label: "Crew", value: boat.crew_size ? `${boat.crew_size} crew` : null },
    { label: "Captain", value: boat.captain_name },
    { label: "Home Port", value: boat.home_port },
    { label: "Departure", value: boat.departure_point },
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
                {boat.instant_confirmation && (
                  <Badge variant="success" className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                    Instant Confirmation
                  </Badge>
                )}
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
                  {trips.map((trip: any) => (
                    <div
                      key={trip.id}
                      className="border border-gray-200 rounded-xl p-5 hover:border-teal-300 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{trip.name}</h3>
                            {trip.trip_type && (
                              <Badge variant="outline" className="text-xs">
                                {TRIP_TYPE_LABELS[trip.trip_type as TripType] || trip.trip_type.replace(/_/g, ' ')}
                              </Badge>
                            )}
                            {boat.cancellation_policy === 'flexible' && (
                              <Badge variant="success" className="text-xs">FREE Cancellation</Badge>
                            )}
                            {boat.instant_confirmation && (
                              <Badge variant="info" className="text-xs flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                                Instant Confirmation
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
                            {trip.departure_time && (
                              <span>Departs {String(trip.departure_time).slice(0, 5)}</span>
                            )}
                            {trip.max_guests && (
                              <span>Up to {trip.max_guests} guests</span>
                            )}
                          </div>

                          {/* Target species */}
                          {trip.target_species && trip.target_species.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {trip.target_species.map((species: string) => (
                                <span
                                  key={species}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454Z" />
                                  </svg>
                                  {species}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Seasonal availability */}
                          {trip.seasonal_months && trip.seasonal_months.length > 0 && trip.seasonal_months.length < 12 && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                              </svg>
                              <span>Available: {trip.seasonal_months.map((m: number) => MONTH_LABELS[m - 1]).join(', ')}</span>
                            </div>
                          )}

                          {trip.includes && Array.isArray(trip.includes) && trip.includes.length > 0 && (
                            <p className="text-xs text-gray-500 mt-2">
                              <span className="font-medium">Includes:</span> {trip.includes.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold text-teal-700">
                            KES {(trip.price_total || trip.price || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-400">per trip</p>
                          {trip.price_per_person && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              or KES {trip.price_per_person.toLocaleString()}/person
                            </p>
                          )}
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
                          : (boat.target_species as unknown as string)?.split(",").map((s: string) => s.trim()) ?? []
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
                          : (boat.fishing_techniques as unknown as string)?.split(",").map((s: string) => s.trim()) ?? []
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
                <div className="bg-gray-50 rounded-xl p-5">
                  <div className="flex items-start gap-4">
                    {boat.captain_image_url ? (
                      <img
                        src={boat.captain_image_url}
                        alt={boat.captain_name}
                        className="w-20 h-20 rounded-full object-cover shrink-0 ring-2 ring-white shadow"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-2xl shrink-0 ring-2 ring-white shadow">
                        {boat.captain_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-lg">
                        Captain {boat.captain_name}
                      </p>
                      {boat.captain_bio && (
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                          {boat.captain_bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Captain stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-200">
                    {boat.captain_experience_years && (
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{boat.captain_experience_years}+</p>
                        <p className="text-xs text-gray-500">Years Experience</p>
                      </div>
                    )}
                    {(boat.captain_fishing_reports ?? 0) > 0 && (
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{boat.captain_fishing_reports}</p>
                        <p className="text-xs text-gray-500">Fishing Reports</p>
                      </div>
                    )}
                    {totalReviews > 0 && (
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{totalReviews}</p>
                        <p className="text-xs text-gray-500">Reviews</p>
                      </div>
                    )}
                    {boat.captain_response_time_hours && (
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">
                          {boat.captain_response_time_hours < 1
                            ? `${Math.round(boat.captain_response_time_hours * 60)}min`
                            : `${boat.captain_response_time_hours}h`}
                        </p>
                        <p className="text-xs text-gray-500">Response Time</p>
                      </div>
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
                    <div className="text-center sm:text-left shrink-0">
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

                  {/* Multi-dimensional boat ratings */}
                  {boatSubRatings && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                      {boatSubRatings.map(({ label, score }) => (
                        <div key={label} className="bg-white border border-gray-100 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">{label}</span>
                            <span className="text-sm font-bold text-gray-900">{score.toFixed(1)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full transition-all"
                              style={{ width: `${(score / 5) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

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
