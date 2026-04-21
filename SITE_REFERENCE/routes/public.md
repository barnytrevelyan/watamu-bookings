# Public routes

Every page reachable without auth. Route → file → data → components → actions → edge
cases → dependencies.

## / — Home

- **File**: `src/app/page.tsx`
- **Server data**: `wb_properties` (featured, `is_published=true`), `wb_boats` (featured,
  `is_published=true`), `wb_images`, `wb_reviews`
- **Components**: `PropertyCard`, `BoatCard`, `SearchFilters`, `WeatherWidget`, `JsonLd`
  (org/website/destination schemas)
- **User actions**: browse featured listings; filter by dates/price; view "Why Watamu"
  highlights; click "List your property/boat" CTA; navigate to /properties, /boats,
  /become-a-host
- **Edge cases**: shows hero + CTAs even when no featured listings; weather widget fails
  gracefully
- **Dependencies**: Supabase, Next.js Image, JSON-LD schemas, `STOCK_IMAGES`

## /about — About the platform

- **File**: `src/app/about/page.tsx`
- **Server data**: none (static)
- **User actions**: read mission; view "What we offer"; see how to get to Watamu; view
  emergency contacts; click "Create owner account" / "Email us"
- **Dependencies**: `STOCK_IMAGES`, Next.js Image

## /activities — Local activities guide

- **File**: `src/app/activities/page.tsx`
- **Server data**: none (static activities list)
- **User actions**: scroll 6 activities (deep-sea fishing, watersports, marine park,
  turtle watch, Mida Creek, restaurants); jump via sidebar; KWS marine park fee info +
  external pay link; CTAs to /boats and /properties
- **Dependencies**: `STOCK_IMAGES`, Next.js Image, external KWS payment link

## /properties — Browse properties

- **File**: `src/app/properties/page.tsx`
- **Server data**: `wb_properties` (`is_published=true`), `wb_amenities`,
  `wb_property_amenities` (intersect filter), `wb_images`, `wb_reviews`
- **Components**: `PropertyCard`, `SearchFilters`, `SortSelect`, pagination
- **Filters**: property_type, min/max price (slider), bedrooms, guests, amenities
  (multi-select; intersect — property must have ALL selected amenities), check_in/out
  date range (excludes properties with any blocked dates in range)
- **Sort**: `price_asc | price_desc | rating | newest` (default: featured first, then
  newest)
- **Pagination**: 12 per page
- **Edge cases**: "No properties found" empty state; invalid sort falls back to default

## /boats — Browse fishing charters

- **File**: `src/app/boats/page.tsx`
- **Server data**: `wb_boats` (`is_published=true`), `wb_boat_trips`, `wb_images`,
  `wb_reviews`
- **Filters**: boat_type, capacity, trip_type (half_day has sub-matching against
  `half_day_morning`/`half_day_afternoon`)
- **Sort**: price (client-side against lowest trip price on each boat)
- **Pagination**: 12 per page
- **Edge cases**: "No boats match" empty state; handles boats with zero trips gracefully

## /map — Interactive map

- **File**: `src/app/map/page.tsx`
- **Library**: Leaflet 1.9.4 + Esri World Imagery tiles
- **Server data**: `wb_properties` (published) + `wb_boats` (published) via
  `src/lib/supabase/client.ts`; static `WATAMU_LOCATIONS` array for landmarks
- **Behaviour**: landmark pins always visible; property pins appear only at zoom ≥ 14
  (`PROPERTY_ZOOM_THRESHOLD = 14`). All markers carry 50% opacity.
- **User actions**: click marker for mini info; zoom to reveal bookable properties;
  click through to detail page
- **Known issue as of 2026-04-21**: landmark coordinates are approximate and may need
  local verification. See `functionality.md` → "Map landmark coordinates".

## /tides — Harmonic tidal prediction

- **File**: `src/app/tides/page.tsx`
- **Server data**: none — calculated client-side using harmonic constituents calibrated
  for the Kenya coast
- **Components**: Canvas chart, tide event list, moon phase emoji
- **User actions**: pick date; see high/low tides; view moon phase
- **Dependencies**: Canvas API, date math (pure client)

## /contact — Contact info

- **File**: `src/app/contact/page.tsx`
- **Server data**: none (reads `NEXT_PUBLIC_WHATSAPP_NUMBER`)
- **Behaviour**: email (hello@watamubookings.com) always shown; WhatsApp card only
  renders if env var is set

## /privacy, /terms — Legal pages

- **Files**: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`
- Pure static content.

## /become-a-host — Host landing page with earnings calculator

- **File**: `src/app/become-a-host/page.tsx` + `EarningsCalculator.tsx` client component
- **Calculator**: slider 1–300,000 KES (step 1,000), computes projected monthly and
  annual earnings at user-defined occupancy. Subscription + commission comparison.

## /properties/[slug] — Property detail

- **File**: `src/app/properties/[slug]/page.tsx`
- **Server data**: `wb_properties`, `wb_images`, `wb_rooms` (with images),
  `wb_property_amenities` + `wb_amenities`, `wb_reviews` + `wb_profiles` (guest),
  `wb_availability`, `wb_profiles` (owner)
- **Components**: `ImageGallery`, `AmenityBadge`, `ReviewCard`, `StarRating`,
  `PropertyBookingSidebar`, `JsonLd` (property + breadcrumb schemas)
- **User actions**: view gallery; rooms breakdown if multi-room; browse amenities; read
  reviews; check availability; submit booking form
- **Edge cases**: 404 if slug missing or `is_published=false`

## /boats/[slug] — Boat detail

- **File**: `src/app/boats/[slug]/page.tsx`
- **Server data**: `wb_boats`, `wb_images`, `wb_boat_trips`, `wb_reviews` +
  `wb_profiles` (guest), `wb_boat_availability`, `wb_boat_feature_links` +
  `wb_boat_features`, `wb_profiles` (owner)
- **User actions**: view gallery; browse trips (duration/price/target species); read
  reviews with fishing-specific ratings (boat_equipment, captain_crew,
  fishing_experience); select trip; submit booking form
- **Edge cases**: 404 if slug missing or `is_published=false`

## /s/[slug] — Short URL redirect

- **File**: `src/app/s/[slug]/page.tsx`
- **Behaviour**: looks up slug in `wb_boats` then `wb_properties`; redirects to the
  canonical detail URL; 404 if neither matches.

## /booking/[id] — Booking status

- **File**: `src/app/booking/[id]/page.tsx`
- **Server data**: `wb_bookings`, `wb_properties`, `wb_boats`, `wb_profiles` (host
  contact info)
- **Branches by `booking_mode`**: `direct` → `EnquiryStatus`; `platform` →
  `BookingClient` (Stripe / M-Pesa)
- **User actions**: view details; proceed to payment (platform mode); see host
  decline reason (enquiry mode)

## /booking/[id]/respond — Host enquiry response

- **File**: `src/app/booking/[id]/respond/page.tsx`
- **Auth**: `enquiry_token` in URL (no login)
- **Actions**: Confirm (host has collected deposit) or Decline with reason
- **Behaviour**: rotates `enquiry_token` after response

## /booking/success — Confirmation

- **File**: `src/app/booking/success/page.tsx`
- **Behaviour**: shows confirmation; links to homepage or further browsing

## /auth/login, /auth/register, /auth/forgot-password, /auth/reset-password, /auth/invite

Standard Supabase email/password flows. `register` has a role toggle (guest/owner) with
conditional owner fields. `invite` validates a token against `wb_invitations`.
