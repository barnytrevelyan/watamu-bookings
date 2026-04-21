# Route deltas

What changed per route when places landed. Grouped by commit so it's easy
to cross-reference against `git show <hash>`.

## Commit 1 — `ca2d095` (foundation)

No route code changed. Only schema + middleware + `getCurrentPlace()`
helper. Every page still rendered hard-coded Watamu copy.

## Commit 2 — `f32a3ec` (public listings + SEO)

### `src/app/page.tsx` (homepage)

- Now `async`; awaits `getCurrentPlace()`.
- Hero image + tagline + description come from `place.hero_image_url`,
  `place.short_tagline`, `place.description`, with a Watamu-shaped
  fallback when `place` is null.
- Properties + boats queries filter by `place_id` / `wb_boat_places`.
- `WeatherWidget` receives the place so the Open-Meteo fetch uses the
  place's centroid rather than hardcoded Watamu lat/lng.

### `src/app/properties/page.tsx` + `src/app/properties/[slug]/page.tsx`

- Listings query now `eq('place_id', place.id)` when a place is resolved.
- Detail page loads the property's place for JSON-LD `Place` nesting.
- `generateMetadata()` uses `place.seo_title` / `place.seo_description`
  when present, with per-place defaults when null.

### `src/app/boats/page.tsx` + `src/app/boats/[slug]/page.tsx`

- Listings query joins through `wb_boat_places` to filter by place.
- Boat detail page loads all places the boat operates from + marks the
  primary place; JSON-LD emits all of them.
- Sitemap dedups boats after the join.

### `src/app/map/page.tsx` + `src/app/map/MapClient.tsx` (new split)

- Server `page.tsx` resolves place, loads properties + boats for that
  place, picks map defaults from `place.centroid_lat/lng` + `default_zoom`
  + `bbox_*`, and reads `place.map_pois_json` for landmark pins.
- Watamu-specific POIs stay baked into `MapClient.tsx` as the fallback
  when `map_pois_json` is empty — so Watamu's Marine Park / Turtle Bay
  pins don't have to be re-entered via admin.

### `src/app/sitemap.ts`

- Iterates all active places; emits per-place `/properties` and `/boats`
  URLs.
- Dedups boat slugs because boat↔place is many-to-many.

### `src/lib/jsonld.ts`

- `propertyToJsonLd()` now takes a `Place` so the `address` / `geo`
  fields reflect the actual place rather than hardcoded Watamu.

### `src/components/WeatherWidget.tsx`

- `place` prop added; centroid lat/lng interpolated into Open-Meteo URL.

### `src/lib/places/queries.ts` (new)

- Thin wrappers around `wb_properties` + `wb_boats` queries that apply
  the place filter consistently. Public pages should import from here
  rather than re-querying.

## Commit 3 — `2120cf0` (tides + activities)

### `src/app/tides/page.tsx` + `src/app/tides/TidesClient.tsx` (split)

- Server wrapper resolves place and passes `lat`/`lng` + `placeName` into
  the client component.
- Client interpolates those into the Open-Meteo marine + weather fetches
  instead of hardcoded Watamu coords.
- All copy headings use `{placeName}` (e.g. "Tides in Malindi today").

### `src/app/tides/layout.tsx`

- `generateMetadata()` resolves place for title/description.

### `src/app/activities/page.tsx`

- Now `async` server component.
- Activities come from `place.activities_json`. Watamu fallback array
  kept for empty places (so Watamu pre-launch didn't need seeded rows).
- KWS Marine Park callout gated behind `isWatamu` — Marine Park is
  Watamu-specific content.

## Commit 4 — `b19262e` (dashboard + auth + legal + emails)

### Root layout — `src/app/layout.tsx`

- Resolves place once; builds `brand` object with
  `{name, short, supportEmail, supportWhatsapp, placeName}`.
- `generateMetadata()` uses the host's brand name + the place name for
  title / description / openGraph.
- Wraps children in `<BrandProvider>`.
- Passes `brandName`, `brandShort`, `supportEmail`, `placeLabel` into
  `<Navbar>` and `<Footer>`.

### Legal + static pages

- `about`, `contact`, `terms`, `privacy`, `become-a-host` are `async`
  server components now. All read `getCurrentPlace()`.
- Watamu-specific content (KWS emergency numbers, Marine Park, Turtle
  Bay directions, Mida Creek, etc.) is gated behind `isWatamu`. Other
  places get a generic fallback block.
- Company name / email / WhatsApp in contact page come from host config.

### Dashboard

- `dashboard/billing/page.tsx` — server component; uses `host.brand_name`
  in pricing copy.
- `dashboard/page.tsx` + `dashboard/properties/page.tsx` — brand-aware
  copy.
- Create/edit forms (`dashboard/properties/new`, `dashboard/properties/[id]`,
  `dashboard/boats/new`, `dashboard/boats/[id]`) use `useBrand()` to
  default `city` and placeholders to the current `placeName`.
- `dashboard/import/page.tsx` — `buildPreview()` takes the place name so
  fallback `city` + departure point get the current place.
- `DashboardSidebar.tsx` displays `{brand.name}`.

### Admin

- `admin/invitations/page.tsx` uses `{brand.name}` in invite copy +
  button labels.

### Auth pages

- `auth/login`, `auth/register`, `auth/forgot-password`,
  `auth/reset-password`, `auth/invite` — all call `useBrand()` client-side
  for headings + footer text.

### Booking + invoice

- `booking/[id]/BookingClient.tsx` — payment disclaimer uses `brand.name`.
- `invoice/[id]/page.tsx` — reads `getCurrentPlace()` server-side;
  derives `billing@${host.host}` for invoice metadata.

### API routes

- `api/import/generic/route.ts` + `api/import/discover/route.ts` —
  `buildSystemPrompt(brandName, placeName)` threads brand context into
  the LLM system prompt so the scraper self-identifies correctly.
  `scrapeGeneric()` / `extractListingsWithLLM()` / `normaliseListing()`
  all accept `brandContext`. Fallback `city` uses `placeName`.
- `api/ical/export/route.ts` — calendar name + `PRODID` + per-event
  `DESCRIPTION` + uid domain all derive from `getCurrentPlace()`.
- `api/ical/import/route.ts` — only change is the `User-Agent` header
  uses `NEXT_PUBLIC_BRAND_NAME`.

### Payment libs

- `src/lib/stripe.ts` — payment intent `description` +
  `metadata.platform` use env brand vars.
- `src/lib/mpesa.ts` — STKPush `TransactionDesc` uses env brand name.

### Emails

- `src/lib/email/templates.ts` — outer HTML layout header + footer use
  `BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Watamu Bookings'`.
- `src/lib/email/enquiry-templates.ts` — same, plus `BRAND_PLACE =
  process.env.NEXT_PUBLIC_BRAND_PLACE ?? 'Watamu'` for "other hosts in
  {place}" copy.

### Error + not-found

- `global-error.tsx` + `not-found.tsx` — copy pulled from env brand name.

## Routes explicitly NOT changed

Routes below still render hardcoded text and will need a follow-up pass
if/when kwetu.ke ships real places beyond Watamu:

- Admin property/boat CRUD forms under `src/app/admin/properties` and
  `src/app/admin/boats` (super-admin-only; acceptable for now).
- Booking-com / Airbnb / FishingBooker scraper shims under
  `src/app/api/import/*` have `let city = 'Watamu'` defaults — these get
  overwritten by JSON-LD extraction in 95% of cases; real fix deferred
  to Task #8 (place picker in the import flow).
- `src/app/admin/places/*` — the admin CRUD for places doesn't exist
  yet. Adding a new place today means inserting a DB row and updating
  `PLACE_SLUGS` in `src/middleware.ts`.
