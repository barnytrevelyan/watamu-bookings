# Watamu Bookings — Current State

_Last updated: 2026-04-20, overnight demo-prep session._

This document captures the repo's state so future sessions can pick up without
archaeology. Pair this with `REGRESSION_GUARD.md` (rules + landmines).

## Stack

- **Framework:** Next.js 14.2.3 App Router, React 18.3.
- **Language:** TypeScript 5.4 (loose — `ignoreBuildErrors: true` in `next.config.js`).
- **Styling:** Tailwind 3.4, design tokens in `src/app/globals.css`.
- **Auth + DB:** Supabase (`@supabase/ssr@0.3`, `@supabase/supabase-js@2.43`)
  project `jiyoxdeiyydyxjymahrh` (WatamuBookings, eu-central-1).
- **Payments:** Stripe + M-Pesa Daraja.
- **Transactional email:** ZeptoMail.
- **AI imports:** OpenAI gpt-4o / gpt-4o-mini (generic scraper only).
- **Maps:** Leaflet via `react-leaflet@4`.
- **Hosting:** Vercel (watamubookings.com).

## Routes (as of today)

### Public
- `/` — home (featured properties + boats, destination JSON-LD).
- `/properties` — filterable list + pagination.
- `/properties/[slug]` — detail, LodgingBusiness JSON-LD, breadcrumb.
- `/boats` — filterable list + pagination.
- `/boats/[slug]` — detail, Service JSON-LD, breadcrumb.
- `/activities` — static things-to-do page (metadata added).
- `/tides` — live Watamu tide predictions (client component; metadata in `tides/layout.tsx`).
- `/map` — interactive map (client component; metadata in `map/layout.tsx`).
- `/about`, `/contact`, `/become-a-host`, `/privacy`, `/terms`.
- `/s/[slug]` — short-url redirector.
- `/invoice/[id]` — printable invoice.

### Booking
- `/booking/[id]` — checkout or enquiry summary depending on `booking_mode`.
- `/booking/[id]/respond` — host magic-link respond page (confirm/decline enquiry).
- `/booking/success` — post-payment redirect.

### Auth
- `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`,
  `/auth/invite`, `/auth/callback` (plus `/api/auth/callback`).

### Host dashboard
- `/dashboard` — home with counts and quick actions.
- `/dashboard/properties` + `/dashboard/properties/new` + `/dashboard/properties/[id]` (edit) + `/dashboard/properties/[id]/analytics` + `/dashboard/properties/[id]/rooms`.
- `/dashboard/boats` + `/dashboard/boats/new` + `/dashboard/boats/[id]`.
- `/dashboard/bookings`, `/dashboard/billing`, `/dashboard/analytics`, `/dashboard/reviews`.
- `/dashboard/import` — AI import wizard (single-box, host-detecting).
- `/dashboard/admin` — host-side admin summary.

### Admin (superadmin)
- `/admin/owners`, `/admin/submissions`, `/admin/subscriptions`, `/admin/invitations`.

### API
- `/api/auth/callback` — OAuth return.
- `/api/availability` — availability check for a date range.
- `/api/bookings/[id]` + `/api/bookings/[id]/respond` — booking actions.
- `/api/cron/billing` — daily subscription billing (needs Vercel cron).
- `/api/ical/import` + `/api/ical/export` + `/api/ical/feeds` — calendar sync.
- `/api/import/airbnb|booking-com|discover|fishingbooker|generic` — scrapers. **Dedicated scrapers (airbnb/booking-com/fishingbooker) are non-AI and must not be touched.** `resolveImportUser()` from `src/lib/import/auth.ts` is required on every route.
- `/api/payments/create-intent` + `/api/payments/mpesa-stk`.
- `/api/subscriptions/activate|cancel|eligibility-check|toggle-listing`.
- `/api/webhooks/mpesa` + `/api/webhooks/stripe` (Stripe needs raw body).
- `/api/admin/subscriptions/mark-paid|trial-override`.

## Core libs / components

- `src/lib/jsonld.ts` — schema.org emitters (property, boat, org, website, destination, breadcrumb).
- `src/lib/images.ts` — canonical image resolver with Unsplash fallback.
- `src/lib/supabase/server.ts` — server-side client with cookie bridge.
- `src/lib/supabase/client.ts` — browser client.
- `src/lib/supabase/admin.ts` — service-role client (API routes only).
- `src/lib/stripe.ts`, `src/lib/mpesa.ts`.
- `src/lib/subscriptions/*` — host billing.
- `src/lib/email/*` — ZeptoMail templates for enquiry + confirmation + host onboarding.
- `src/lib/import/auth.ts` — **do not touch** `resolveImportUser()`.
- `src/lib/import/shared.ts` — SSRF guards + common helpers.
- Components: `Navbar`, `Footer`, `PropertyCard`, `BoatCard`, `SearchFilters`,
  `ImageGallery`, `BookingCalendar`, `StarRating`, `ReviewCard`, `AmenityBadge`,
  `BillingModePicker`, `CalendarSync`, `DashboardShell`, `DashboardSidebar`,
  `WeatherWidget`, `JsonLd`, and a `ui/` primitive set (`Button`, `Card`,
  `Input`, `Modal`, `Select`, `Tabs`, `Textarea`, `Badge`).

## Resilience layer (added 2026-04-20)

- `src/app/error.tsx`, `src/app/global-error.tsx` — catches runtime errors
  below/above the root layout respectively.
- `src/app/not-found.tsx` — custom 404 matching brand.
- `src/app/loading.tsx` — generic suspense fallback.
- `src/app/properties/loading.tsx` + `src/app/boats/loading.tsx` — card-grid skeletons.

## SEO / AI visibility (added 2026-04-20)

- JSON-LD on `/`, `/properties/[slug]`, `/boats/[slug]`.
- `src/app/robots.ts` explicitly opts in AI crawlers (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, Applebot-Extended, FacebookBot,
  Bytespider, Amazonbot, anthropic-ai, cohere-ai, OAI-SearchBot, etc.).
- `public/llms.txt` — Watamu-focused AI crawler doc (pricing, fishing season, etc.).
- `public/site.webmanifest` — PWA manifest.
- `src/app/sitemap.ts` — dynamic sitemap from Supabase.
- Security headers in `next.config.js` — HSTS, X-Frame-Options, Permissions-Policy, etc.

## Demo seed (remove before go-live)

Supabase migration `demo_seed_watamu_2026_04_20` loaded 3 demo hosts,
5 properties, 4 boats, 25 images, 7 boat trips, 10 bookings, 5 reviews.

- Identifiers: property/boat `slug LIKE 'demo-%'`, host email
  suffix `@watamu-bookings.demo`.
- Teardown script: `scripts/demo_cleanup.sql`.

### Demo listings (slug → title)

Properties:
- `demo-jumba-la-bahari` — Jumba la Bahari — Beachfront Villa (KES 38,500).
- `demo-kiboko-beach-house` — Kiboko Beach House — 3BR on the Reef Edge (KES 22,500).
- `demo-mvua-banda` — Mvua Banda — Thatched Garden Cottage (KES 7,500).
- `demo-mwezi-penthouse` — Mwezi Penthouse — Rooftop Ocean View (KES 14,500).
- `demo-pwani-studio` — Pwani Studio — Nomad Base, 300m from Beach (KES 4,200).

Boats:
- `demo-samaki-42` — Samaki 42 — Tournament Sport Fisher.
- `demo-jahazi-mawingu` — Jahazi Mawingu — Traditional Sunset Dhow.
- `demo-pepo-catamaran` — Pepo Catamaran — Reef & Snorkel Adventures.
- `demo-kioo-glass-bottom` — Kioo Glass-Bottom — Reef Tours.

## Known issues / open items

1. **Push to GitHub requires a PAT** — it's not stored in the session.
2. **Availability race:** `wb_check_property_availability` /
   `wb_check_boat_availability` only treat `status = 'confirmed'` as
   blocking, so two guests can be in Stripe checkout for the same dates.
3. **Featured listings on homepage** rely on `is_featured`. Verify demo data
   surfaces on `/` (at least one property/boat marked featured, or the
   fallback picks from the highest-rated).
4. `next.config.js` has `typescript.ignoreBuildErrors: true` and
   `eslint.ignoreDuringBuilds: true` — intentional, keep for deploy speed.
5. Unsplash image URLs are hotlinked — a CDN outage will break demo images.
6. `scripts/demo_cleanup.sql` must be run before real customers transact.

## Environment variables (must be set in Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` (API routes only).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`.
- `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM` (+ ZEPTOMAIL_FROM_NAME).
- `OPENAI_API_KEY`.
- `NEXT_PUBLIC_SITE_URL` (defaults to `https://watamubookings.com`).
- `CRON_SECRET` for `/api/cron/billing`.

## Canonical constants

- Host commission rate: **8%** (source of truth: `wb_settings.commission_rate` in Supabase; hard-coded fallback in `src/lib/subscriptions/pricing.ts`).
- First listing subscription: KES 5,000/mo; each additional: KES 2,500/mo; annual prepay: 10 months; grace period: 48h.

## Commit history (master head)

- `2063c99` — fix(demo-prep): wire up search + sort, unify contact details, add state docs. **Not yet pushed — awaiting PAT.**
- `b95cb2c` — feat(seo+resilience): JSON-LD, llms.txt, error boundaries, regression guard.
- `fbd8dd9` — feat(ui): Airbnb-grade polish for host dashboard + public listing headers.
- `7a9d991` — fix(import): restore manual-JWT fallback on all 5 scraper routes.
- `9fa4f1c` — fix(import): accept bare hostnames in the URL box.
- `e68b0df` — fix(import): gate Import button on auth loading.
- `cac0748` — feat(import): multi-listing discovery for generic URLs.
