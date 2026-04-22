// ============================================================
// Watamu Bookings — TypeScript types for all database tables
// Aligned with actual Supabase schema (April 2026)
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
  | 'penthouse'
  | 'bungalow'
  | 'studio'
  | 'beach_house';

export type BoatType =
  | 'deep_sea'
  | 'sport_fisher'
  | 'dhow'
  | 'catamaran'
  | 'speedboat'
  | 'glass_bottom'
  | 'kayak'
  | 'sailboat';

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

export type RoomType = 'bedroom' | 'suite' | 'studio' | 'dormitory' | 'entire_unit';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export type PlaceKind = 'country' | 'region' | 'county' | 'town' | 'neighbourhood' | 'marina';

export type PlaceVisibility = 'hidden' | 'preview' | 'public';

/** Product surfaces a place can expose. Drives nav + route visibility. */
export type PlaceFeature =
  | 'properties'
  | 'boats'
  | 'tides'
  | 'marine-park'
  | 'safari'
  | 'adventure'
  | 'lakes'
  | 'cultural';

// ----- Places -----

export interface Place {
  id: string;
  slug: string;
  name: string;
  parent_place_id: string | null;
  kind: PlaceKind;
  country_code: string;
  centroid_lat: number | null;
  centroid_lng: number | null;
  bbox_north: number | null;
  bbox_south: number | null;
  bbox_east: number | null;
  bbox_west: number | null;
  default_zoom: number;
  timezone: string;
  hero_image_url: string | null;
  short_tagline: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  activities_json: PlaceActivity[];
  map_pois_json: PlaceMapPoi[];
  /** Publication state. 'preview' is visible only via magic-link / admin. */
  visibility: PlaceVisibility;
  /** Product surfaces this place exposes (boats, tides, etc.). */
  features: PlaceFeature[];
  /** @deprecated Use `visibility === 'public'`. Kept in sync by DB trigger. */
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlaceActivity {
  title: string;
  image: string;
  description: string;
  tags?: string[];
  featured?: boolean;
}

export interface PlaceMapPoi {
  name: string;
  category: string;
  description?: string;
  lat: number;
  lng: number;
  icon?: string;
  colour?: string;
}

export interface PlaceHost {
  host: string;
  place_id: string | null;
  brand_name: string;
  brand_short: string;
  is_multi_place: boolean;
  default_og_image: string | null;
  support_email: string | null;
  support_whatsapp: string | null;
  created_at: string;
  updated_at: string;
}

/** Resolved place context for a given request host — produced by `getCurrentPlace()`. */
export interface PlaceContext {
  /** null when the host is a multi-place shell (e.g. kwetu.ke) and no specific place is selected */
  place: Place | null;
  /** Brand + host config — always present */
  host: {
    host: string;
    brand_name: string;
    brand_short: string;
    is_multi_place: boolean;
    support_email: string | null;
    support_whatsapp: string | null;
  };
}

export interface BoatPlace {
  boat_id: string;
  place_id: string;
  is_primary: boolean;
  created_at: string;
}

// ----- Database row types -----

export interface Profile {
  id: string; // uuid, references auth.users
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  bio: string | null;
  business_name: string | null;
  owner_type: 'property' | 'boat' | 'both' | null;
  is_verified: boolean;
  is_super_admin: boolean;
  /** Flexi pricing host defaults — inherited by properties with null overrides. */
  flexi_default_enabled: boolean;
  flexi_default_window_days: number;
  flexi_default_cutoff_days: number;
  flexi_default_floor_percent: number;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  property_type: PropertyType;
  address: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  max_guests: number;
  bedrooms: number | null;
  bathrooms: number | null;
  base_price_per_night: number;
  currency: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  cancellation_policy: CancellationPolicy | null;
  house_rules: string | null;
  is_published: boolean;
  is_featured: boolean;
  avg_rating: number;
  review_count: number;
  status: string | null;
  rejection_reason: string | null;
  low_season_price: number | null;
  high_season_price: number | null;
  peak_season_price: number | null;
  low_season_months: string | null;
  high_season_months: string | null;
  peak_season_months: string | null;
  /** Flexi pricing (last-minute discount). When enabled, the nightly rate
   *  ramps down linearly from base (at window edge) to floor (at day 0).
   *  Null window/floor inherit the host's defaults on wb_profiles. */
  flexi_enabled: boolean;
  flexi_window_days: number | null;
  flexi_cutoff_days: number | null;
  flexi_floor_percent: number | null;
  source_url: string | null;
  import_source: string | null;
  place_id: string;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  property_id: string;
  name: string;
  description: string | null;
  room_type: RoomType | null;
  max_guests: number | null;
  bed_count: number | null;
  bed_type: string | null;
  price_per_night: number | null;
  is_available: boolean;
  sort_order: number | null;
  created_at: string;
  // Joined data (not a DB column, populated via Supabase joins)
  images?: Image[];
}

export interface Amenity {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  sort_order?: number | null;
}

export interface PropertyAmenity {
  property_id: string;
  amenity_id: string;
}

export interface Boat {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  boat_type: BoatType;
  capacity: number;
  length_ft: number | null;
  crew_size: number | null;
  captain_name: string | null;
  captain_included: boolean;
  home_port: string | null;
  departure_point: string | null;
  latitude: number | null;
  longitude: number | null;
  currency: string | null;
  cancellation_policy: CancellationPolicy | null;
  safety_equipment: string | null;
  fishing_techniques: string[] | null;
  target_species: string[] | null;
  is_published: boolean;
  is_featured: boolean;
  avg_rating: number;
  review_count: number;
  status: string | null;
  rejection_reason: string | null;
  instant_confirmation: boolean;
  captain_bio: string | null;
  captain_image_url: string | null;
  captain_experience_years: number | null;
  captain_response_time_hours: number | null;
  captain_fishing_reports: number;
  source_url: string | null;
  import_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoatFeature {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
}

export interface BoatFeatureLink {
  boat_id: string;
  feature_id: string;
}

export interface BoatTrip {
  id: string;
  boat_id: string;
  name: string;
  description: string | null;
  trip_type: TripType;
  duration_hours: number;
  max_guests: number;
  price_total: number;
  price_per_person: number | null;
  currency: string | null;
  departure_time: string | null;
  includes: string[] | null;
  is_active: boolean;
  sort_order: number | null;
  target_species: string[] | null;
  seasonal_months: number[] | null;
  created_at: string;
}

export interface Image {
  id: string;
  listing_type: ListingType;
  property_id: string | null;
  room_id: string | null;
  boat_id: string | null;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
}

export interface Availability {
  id: string;
  property_id: string;
  room_id: string | null;
  date: string;
  is_blocked: boolean;
  price_override: number | null;
  min_nights: number | null;
  notes: string | null;
}

export interface BoatAvailability {
  id: string;
  boat_id: string;
  date: string;
  is_blocked: boolean;
  price_override: number | null;
  notes: string | null;
}

export interface Booking {
  id: string;
  listing_type: ListingType;
  property_id: string | null;
  room_id: string | null;
  boat_id: string | null;
  trip_id: string | null;
  guest_id: string;
  check_in: string;
  check_out: string;
  trip_date: string | null;
  guests_count: number;
  adults_count: number | null;
  children_count: number;
  total_price: number;
  currency: string | null;
  status: BookingStatus;
  guest_contact_name: string | null;
  guest_contact_email: string | null;
  guest_contact_phone: string | null;
  special_requests: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  currency: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  mpesa_checkout_request_id: string | null;
  mpesa_receipt_number: string | null;
  mpesa_phone: string | null;
  transaction_ref: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  listing_type: ListingType;
  property_id: string | null;
  boat_id: string | null;
  guest_id: string;
  rating: number;
  comment: string | null;
  owner_response: string | null;
  owner_responded_at: string | null;
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
  is_published: boolean;
  reported_catch: string[];
  trip_name: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  token: string | null;
  invited_by: string | null;
  role: UserRole;
  owner_type: string | null;
  message: string | null;
  status: InvitationStatus;
  accepted_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface Settings {
  key: string;
  value: Record<string, unknown> | null;
  updated_at: string;
}

// ----- Computed / derived types -----

export interface PropertyWithAmenities extends Property {
  amenities: Amenity[];
  images: Image[];
  rooms: Room[];
  owner: Profile;
  place?: Place | null;
}

export interface BoatWithFeatures extends Boat {
  features: BoatFeature[];
  images: Image[];
  trips: BoatTrip[];
  owner: Profile;
  places?: Place[];
  primary_place?: Place | null;
}

export interface BookingWithDetails extends Booking {
  guest: Profile;
  payment: Payment | null;
  review: Review | null;
  property?: Property;
  boat?: Boat;
  trip?: BoatTrip;
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
  place_id?: string;
  place_slug?: string;
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

export type PropertyInsert = Omit<Property, 'id' | 'created_at' | 'updated_at' | 'avg_rating' | 'review_count'>;
export type PropertyUpdate = Partial<PropertyInsert>;

export type BoatInsert = Omit<Boat, 'id' | 'created_at' | 'updated_at' | 'avg_rating' | 'review_count'>;
export type BoatUpdate = Partial<BoatInsert>;

export type BookingInsert = Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'status'>;
export type ReviewInsert = Omit<Review, 'id' | 'created_at' | 'owner_response' | 'owner_responded_at'>;
