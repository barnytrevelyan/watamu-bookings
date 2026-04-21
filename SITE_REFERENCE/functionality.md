# Cross-cutting functionality

## Authentication

- **Provider**: Supabase Auth (email/password, OAuth optional)
- **Flow**: sign up → email confirmation → JWT in httpOnly cookie via Supabase client
- **Session**: `useAuth()` hook reads `supabase.auth.getSession()`; server reads from
  auth header
- **Protected routes**: middleware / layout guards redirect unauthenticated → `/auth/login`
- **Roles**: `guest` (default), `owner` (has properties/boats), `admin`
- **Permissions**: RLS policies on `wb_host_subscriptions`, `wb_subscription_invoices`,
  `wb_trial_consumed`, `wb_signup_signals`, admin tables

## Payments

### Stripe (commission mode — 8% default)
- Flow: guest books → `pending_payment` → `/api/payments/create-intent` → Stripe.js
  collects card → `payment_intent.succeeded` webhook → `confirmed`
- Commission: `total_price * 0.08` or configurable via `billing.commission_rate_bps` in
  `wb_settings`
- Stored in `wb_payments`; `stripe_payment_intent_id` referenced from `wb_bookings`

### M-Pesa (Kenyan mobile money)
- Flow: guest enters phone → `/api/payments/mpesa-stk` → STK prompt → PIN → webhook →
  `confirmed`
- Used for commission bookings + subscription invoice payments
- Stored in `wb_payments` with `mpesa_transaction_id`; webhook at
  `/api/webhooks/mpesa`

### Subscription (flat fee)
- KES 5,000/mo first property + KES 2,500/mo each additional (10-month annual discount)
- Trial: 2 months (launch) / 1 month (standard), with 48h grace after unpaid invoice
- Anti-abuse: phone + listing fingerprint matching against `wb_trial_consumed`
- Payment methods: bank transfer, M-Pesa, cash (admin-recorded), Stripe (optional),
  waived (admin)

## Image handling

- **Storage**: Supabase Storage bucket `watamu-images`
- **Optimisation**: Next.js Image + Supabase CDN (WebP, responsive sizes)
- **Upload**: host form → bucket → public URL saved to `wb_images` with `sort_order`
- **Fallback**: `getPropertyImage()` / `getBoatImage()` return stock if no images
- **Gallery**: `ImageGallery` component with `next/image`
- **Cover**: first-sorted image; reorderable

## SEO

- **OpenGraph**: property/boat detail pages include `og:title`, `og:description`,
  `og:image`
- **JSON-LD**: Organization + Website (home), LocalBusiness, Property (detail),
  Boat/Charter (detail), BreadcrumbList (navigation)
- **Sitemap**: dynamic, hourly revalidate
- **Robots**: disallows private paths; allows AI crawlers
- **Metadata**: via Next.js Metadata API; overrideable per page

## Map landmark coordinates (2026-04-21 note)

The `/map` page places static landmark pins from `WATAMU_LOCATIONS` in
`src/app/map/page.tsx`. The latest research-derived coordinates still showed
some visible drift on the live site. If you need to refine them:

1. Use Google Maps / OpenStreetMap and copy the coordinate by right-clicking the
   exact building — do not trust agent-generated coords for small Watamu landmarks.
2. Keep pins anchored to the known-good Watamu village centre (~-3.3567, 40.0225)
   and shoreline (longitude ~40.027). Anything east of 40.030 sits in the Indian
   Ocean. Mida Creek is **west** of the village, not east.
3. Gede Ruins are well-geocoded (`-3.3094, 40.0172`) — use as a northern anchor.

All map pins are rendered with 50% opacity (divIcon SVGs with `opacity: 0.5`).
Property markers appear only at zoom ≥ 14 (`PROPERTY_ZOOM_THRESHOLD`).

## Database (Supabase PostgreSQL) — canonical tables

1. `wb_profiles` — users (guest/owner/admin)
2. `wb_properties` — rental properties
3. `wb_boats` — fishing charters
4. `wb_bookings` — reservations (direct + platform modes)
5. `wb_images` — images for listings
6. `wb_reviews` — guest reviews
7. `wb_amenities` — reusable amenity list
8. `wb_property_amenities` — junction (property ↔ amenity)
9. `wb_boat_trips` — trip offerings per boat
10. `wb_boat_features` — boat equipment list
11. `wb_boat_feature_links` — junction (boat ↔ feature)
12. `wb_rooms` — rooms within multi-room properties
13. `wb_availability` — date-level blocking + price overrides for properties
14. `wb_boat_availability` — blocked dates for boats
15. `wb_payments` — Stripe + M-Pesa transaction log
16. `wb_host_subscriptions` — subscription records
17. `wb_subscription_invoices` — monthly/annual invoices
18. `wb_subscription_events` — audit log
19. `wb_trial_consumed` — anti-abuse tracker
20. `wb_signup_signals` — soft fraud signals
21. `wb_settings` — platform config (KES prices, billing rules, feature flags)
22. `wb_invitations` — owner invitation tokens

## Key RPC functions

- `wb_check_property_availability(property_id, check_in, check_out)` → boolean
- `wb_check_boat_availability(boat_id, trip_date, [trip_id])` → boolean
- `wb_compute_monthly_charge_kes(listing_count)` → numeric
- `wb_host_subscription_listing_count(host_id)` → integer
- `wb_trial_match_listing(lat, lng, title, address)` → uuid | null
- `wb_normalise_phone(text)` → text (E.164)
- `wb_normalise_text(text)` → text (fuzzy matching)
- `wb_haversine_m(lat1, lng1, lat2, lng2)` → numeric (metres)
- `wb_generate_invoice_number()` → text (WB-INV-YYYYMM-NNNN)

## Row-Level Security

- Hosts: read own properties/boats/bookings/subscriptions
- Guests: read own bookings; see published properties/boats
- Admins: bypass via service role or explicit allow policies
- Payments/invoices/trial records/signals: owner + admin only

## Environment variables

- `NEXT_PUBLIC_SITE_URL` — base URL (default https://watamubookings.com)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`
- `NEXT_PUBLIC_WHATSAPP_NUMBER` — gates /contact WhatsApp card
- `ZEPTOMAIL_API_KEY` — transactional email
- `CRON_SECRET` — nightly billing cron

## Route counts (2026-04-21)

- Public: 11
- Property/boat detail: 3
- Booking/enquiry: 3
- Auth: 5
- Host dashboard: 15
- Admin: 5
- API: 24
- Special: 4
- **Total page routes**: 44
- **Total API route.ts**: 24
- **Total unique routes**: 68+
