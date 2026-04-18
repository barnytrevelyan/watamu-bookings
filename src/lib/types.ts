// ============================================================
// Watamu Bookings — TypeScript types for all database tables
// ============================================================

// ----- Enums -----

export type UserRole = 'admin' | 'owner' | 'guest';

export type PropertyType =
  | 'villa'
  | 'apartment'
  | 'cottage'
  | 'house'
  | 'hotel'
  | 'banda'
  | 'penthouse';

export type BoatType =
  | 'deep_sea'
  | 'sport_fisher'
  | 'dhow'
  | 'catamaran'
  | 'speedboat'
  | 'glass_bottom'
  | 'kayak';

export type TripType =
  | 'half_day'
  | 'half_day_morning'
  | 'half_day_afternoon'
  | 'full_day'
  | 'overnight'
  | 'multi_day'
  | 'sunset_cruise'
  | 'custom';

/** Human-friendly labels for trip types */
export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  half_day: 'Half Day',
  half_day_morning: 'Half Day — Morning',
  half_day_afternoon: 'Half Day — Afternoon',
  full_day: 'Full Day',
  overnight: 'Overnight',
  multi_day: 'Multi-Day',
  sunset_cruise: 'Sunset Cruise',
  custom: 'Custom',
};

/** Short month labels for seasonal display */
export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'refunded';

export type PaymentMethod = 'stripe' | 'mpesa';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type ListingType = 'property' | 'boat';

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

export type Currency = 'KES' | 'USD' | 'EUR' | 'GBP';

export type ListingStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

// ----- Database row types -----

export interface Profile {
  id: string; // uuid, references auth.users
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  bio: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  description: string;
  property_type: PropertyType;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  price_per_night: number;
  currency: Currency;
  max_guests: number;
  bedrooms: number;
  bathrooms: number;
  cancellation_policy: CancellationPolicy;
  is_published: boolean;
  is_featured: boolean;
  rating_average: number;
  rating_count: number;
  status: ListingStatus;
  rejection_reason: string | null;
  low_season_price: number | null;
  high_season_price: number | null;
  peak_season_price: number | null;
  low_season_months: string | null;
  high_season_months: string | null;
  peak_season_months: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  property_id: string;
  name: string;
  description: string | null;
  beds: number;
  max_guests: number;
  price_per_night: number;
  created_at: string;
  updated_at: string;
}

export interface Amenity {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  created_at: string;
}

export interface PropertyAmenity {
  id: string;
  property_id: string;
  amenity_id: string;
}

export interface Boat {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  boat_type: BoatType;
  capacity: number;
  length_ft: number | null;
  crew_size: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  price_per_trip: number;
  currency: Currency;
  cancellation_policy: CancellationPolicy;
  is_published: boolean;
  is_featured: boolean;
  rating_average: number;
  rating_count: number;
  status: ListingStatus;
  rejection_reason: string | null;
  instant_confirmation: boolean;
  captain_name: string | null;
  captain_bio: string | null;
  captain_image_url: string | null;
  captain_experience_years: number | null;
  captain_response_time_hours: number | null;
  captain_fishing_reports: number;
  target_species: string[] | null;
  fishing_techniques: string[] | null;
  departure_point: string | null;
  safety_equipment: string | null;
  home_port: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoatFeature {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  created_at: string;
}

export interface BoatFeatureLink {
  id: string;
  boat_id: string;
  feature_id: string;
}

export interface BoatTrip {
  id: string;
  boat_id: string;
  trip_type: TripType;
  name: string;
  description: string | null;
  duration_hours: number;
  price: number;
  price_total: number;
  price_per_person: number | null;
  currency: Currency;
  max_passengers: number;
  max_guests?: number;
  includes: string[];
  departure_time: string | null;
  target_species: string[];
  seasonal_months: number[];
  created_at: string;
  updated_at: string;
}

export interface Image {
  id: string;
  listing_type: ListingType;
  listing_id: string;
  url: string;
  alt: string | null;
  position: number;
  is_cover: boolean;
  created_at: string;
}

export interface Availability {
  id: string;
  property_id: string;
  date: string;
  is_available: boolean;
  price_override: number | null;
  created_at: string;
}

export interface BoatAvailability {
  id: string;
  boat_id: string;
  date: string;
  is_available: boolean;
  slots_remaining: number;
  price_override: number | null;
  created_at: string;
}

export interface Booking {
  id: string;
  guest_id: string;
  listing_type: ListingType;
  listing_id: string;
  boat_trip_id: string | null;
  check_in: string;
  check_out: string;
  guests_count: number;
  adults_count: number | null;
  children_count: number;
  total_amount: number;
  currency: Currency;
  status: BookingStatus;
  cancellation_policy: CancellationPolicy;
  special_requests: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  mpesa_receipt_number: string | null;
  mpesa_phone: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  reviewer_id: string;
  listing_type: ListingType;
  listing_id: string;
  rating: number;
  comment: string | null;
  owner_reply: string | null;
  // Property sub-ratings
  cleanliness_rating: number | null;
  location_rating: number | null;
  value_rating: number | null;
  communication_rating: number | null;
  // Boat sub-ratings
  boat_equipment_rating: number | null;
  captain_crew_rating: number | null;
  fishing_experience_rating: number | null;
  // Verified + catch
  is_verified: boolean;
  reported_catch: string[];
  trip_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface Settings {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

// ----- Computed / derived types -----

export interface PropertyWithAmenities extends Property {
  amenities: Amenity[];
  images: Image[];
  rooms: Room[];
  owner: Profile;
}

export interface BoatWithFeatures extends Boat {
  features: BoatFeature[];
  images: Image[];
  trips: BoatTrip[];
  owner: Profile;
}

export interface BookingWithDetails extends Booking {
  guest: Profile;
  payment: Payment | null;
  review: Review | null;
  property?: Property;
  boat?: Boat;
  boat_trip?: BoatTrip;
}

export interface ReviewWithAuthor extends Review {
  reviewer: Profile;
}

export interface PropertyWithReviews extends PropertyWithAmenities {
  reviews: ReviewWithAuthor[];
}

export interface BoatWithReviews extends BoatWithFeatures {
  reviews: ReviewWithAuthor[];
}

// ----- Search & filter types -----

export interface DateRange {
  from: string; // ISO date string
  to: string;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface SearchFilters {
  query?: string;
  listing_type?: ListingType;
  property_type?: PropertyType[];
  boat_type?: BoatType[];
  trip_type?: TripType[];
  dates?: DateRange;
  price_range?: PriceRange;
  currency?: Currency;
  guests?: number;
  bedrooms?: number;
  bathrooms?: number;
  amenities?: string[];
  boat_features?: string[];
  location?: string;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  is_featured?: boolean;
  sort_by?: 'price_asc' | 'price_desc' | 'rating' | 'newest';
  page?: number;
  per_page?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ----- API / form helper types -----

export type PropertyInsert = Omit<Property, 'id' | 'created_at' | 'updated_at' | 'rating_average' | 'rating_count'>;
export type PropertyUpdate = Partial<PropertyInsert>;

export type BoatInsert = Omit<Boat, 'id' | 'created_at' | 'updated_at' | 'rating_average' | 'rating_count'>;
export type BoatUpdate = Partial<BoatInsert>;

export type BookingInsert = Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'status'>;
export type ReviewInsert = Omit<Review, 'id' | 'created_at' | 'updated_at' | 'owner_reply'>;
