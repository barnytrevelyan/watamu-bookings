import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient as createServerClient } from "@/lib/supabase/server";
import ImageGallery from "@/components/ImageGallery";
import AmenityBadge from "@/components/AmenityBadge";
import ReviewCard from "@/components/ReviewCard";
import StarRating from "@/components/StarRating";
import { Badge } from "@/components/ui/Badge";
import PropertyBookingSidebar from "./PropertyBookingSidebar";
import type { Property, Room, Amenity, Review, Image } from "@/lib/types";

/* ---------- Data fetching ---------- */

interface PropertyDetail extends Property {
  images: Image[];
  rooms: Room[];
  amenities: { amenity: Amenity }[];
  reviews: Review[];
  owner: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    created_at: string;
  } | null;
}

async function getProperty(slug: string): Promise<PropertyDetail | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("wb_properties")
    .select(
      `
      *,
      images:wb_images(id, url, alt_text, sort_order),
      rooms:wb_rooms(id, name, description, bed_count, max_guests, price_per_night, images:wb_images(id, url, alt_text, sort_order)),
      amenities:wb_property_amenities(amenity:wb_amenities(id, name, icon, category)),
      reviews:wb_reviews(
        id, rating, comment, created_at,
        cleanliness_rating, location_rating, value_rating, communication_rating,
        author:wb_profiles!guest_id(id, full_name, avatar_url)
      ),
      owner:wb_profiles!wb_properties_owner_id_fkey(id, full_name, avatar_url, created_at)
    `
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) return null;
  return data as unknown as PropertyDetail;
}

async function getAvailability(propertyId: string) {
  const supabase = await createServerClient();
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("wb_availability")
    .select("date, is_blocked, price_override")
    .eq("property_id", propertyId)
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
  const property = await getProperty(slug);
  if (!property) return { title: "Property Not Found" };

  const coverImage = property.images?.sort((a, b) => a.sort_order - b.sort_order)[0];

  return {
    title: property.name,
    description: property.description?.slice(0, 160),
    openGraph: {
      title: property.name,
      description: property.description?.slice(0, 160),
      images: coverImage ? [{ url: coverImage.url, alt: coverImage.alt_text ?? property.name }] : [],
    },
  };
}

/* ---------- Page ---------- */

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) notFound();

  const availability = await getAvailability(property.id);

  const sortedImages = (property.images ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const amenities = (property.amenities ?? []).map((pa) => pa.amenity);
  const reviews = property.reviews ?? [];
  const rooms = property.rooms ?? [];

  // Compute ratings breakdown
  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));

  // Group amenities by category
  const amenitiesByCategory = amenities.reduce<Record<string, Amenity[]>>((acc, a) => {
    const cat = a.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-white">
      {/* Image gallery */}
      <ImageGallery images={sortedImages} alt={property.name} />

      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
        <div className="lg:grid lg:grid-cols-3 lg:gap-12">
          {/* ===== Main content (2/3) ===== */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="secondary">{property.property_type}</Badge>
                {property.is_featured && <Badge variant="default">Featured</Badge>}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                {property.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-gray-600">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  {[property.city, property.county || 'Kilifi', property.country || 'Kenya'].filter(Boolean).join(', ') || "Watamu, Kenya"}
                </span>
                {totalReviews > 0 && (
                  <span className="flex items-center gap-1">
                    <StarRating rating={averageRating} />
                    <span className="font-medium">{averageRating.toFixed(1)}</span>
                    <span className="text-gray-400">({totalReviews} review{totalReviews !== 1 ? "s" : ""})</span>
                  </span>
                )}
              </div>
              {/* Quick stats */}
              <div className="flex flex-wrap gap-6 mt-4 text-sm text-gray-700">
                {property.bedrooms != null && (
                  <span>{property.bedrooms} bedroom{property.bedrooms !== 1 ? "s" : ""}</span>
                )}
                {property.bathrooms != null && (
                  <span>{property.bathrooms} bathroom{property.bathrooms !== 1 ? "s" : ""}</span>
                )}
                {property.max_guests != null && (
                  <span>Up to {property.max_guests} guest{property.max_guests !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>

            {/* Description */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">About this property</h2>
              <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                {property.description}
              </div>
            </section>

            {/* Amenities */}
            {amenities.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Amenities</h2>
                {Object.entries(amenitiesByCategory).map(([category, items]) => (
                  <div key={category} className="mb-4">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                      {category}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {items.map((amenity) => (
                        <AmenityBadge key={amenity.id} name={amenity.name} icon={amenity.icon ?? undefined} category={(amenity.category as any) ?? undefined} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Rooms */}
            {rooms.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Rooms</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="border border-gray-200 rounded-xl p-5 hover:border-teal-300 transition-colors"
                    >
                      {room.images && room.images.length > 0 && (
                        <div
                          className="w-full h-36 rounded-lg mb-3 bg-cover bg-center"
                          style={{ backgroundImage: `url(${room.images[0].url})` }}
                        />
                      )}
                      <h3 className="font-semibold text-gray-900">{room.name}</h3>
                      {room.description && (
                        <p className="text-sm text-gray-600 mt-1">{room.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {room.bed_count && <span>{room.bed_count} bed{room.bed_count !== 1 ? 's' : ''}</span>}
                        {room.max_guests && (
                          <span>Sleeps {room.max_guests}</span>
                        )}
                      </div>
                      {room.price_per_night && (
                        <p className="mt-2 text-teal-700 font-semibold">
                          KES {room.price_per_night.toLocaleString()}{" "}
                          <span className="text-gray-400 font-normal text-sm">/ night</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* House rules */}
            {property.house_rules && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">House Rules</h2>
                <div className="prose prose-gray max-w-none text-gray-700 text-sm whitespace-pre-line">
                  {property.house_rules}
                </div>
              </section>
            )}

            {/* Map placeholder */}
            {(property.latitude || property.longitude) && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Location</h2>
                <div className="w-full h-64 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-gray-200 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <svg className="w-10 h-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    <p className="text-sm font-medium">{[property.city, property.county || 'Kilifi', property.country || 'Kenya'].filter(Boolean).join(', ') || "Watamu, Kenya"}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)}
                    </p>
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
                      <p className="text-5xl font-bold text-gray-900">{averageRating.toFixed(1)}</p>
                      <StarRating rating={averageRating} size="lg" />
                      <p className="text-sm text-gray-500 mt-1">{totalReviews} review{totalReviews !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {ratingDistribution.map(({ star, count }) => (
                        <div key={star} className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 w-4">{star}</span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{
                                width: totalReviews > 0 ? `${(count / totalReviews) * 100}%` : "0%",
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
                <p className="text-gray-500">No reviews yet. Be the first to share your experience!</p>
              )}
            </section>
          </div>

          {/* ===== Sidebar (1/3) ===== */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Booking form */}
              <PropertyBookingSidebar
                propertyId={property.id}
                propertySlug={property.slug}
                pricePerNight={property.base_price_per_night}
                maxGuests={property.max_guests}
                rooms={rooms}
                availability={availability}
                cleaningFee={(property as { cleaning_fee?: number | null }).cleaning_fee ?? 0}
                serviceFeePercent={(property as { billing_mode?: string }).billing_mode === 'subscription' ? 0 : ((property as { service_fee_percent?: number | null }).service_fee_percent ?? 8)}
              />

              {/* Owner info */}
              {property.owner && (
                <div className="border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Hosted by</h3>
                  <div className="flex items-center gap-3">
                    {property.owner.avatar_url ? (
                      <img
                        src={property.owner.avatar_url}
                        alt={property.owner.full_name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg">
                        {property.owner.full_name?.charAt(0)?.toUpperCase() || "H"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{property.owner.full_name}</p>
                      <p className="text-sm text-gray-500">
                        Member since{" "}
                        {new Date(property.owner.created_at).toLocaleDateString("en-GB", {
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
