# Overnight audit — V2 (2026-04-20 → 2026-04-21)

_Second, deeper pass. Every finding verified by opening the file before
flagging. Agent false positives called out explicitly._

## Severity

- 🔴 **Critical** — breaks demo or blocks a user journey
- 🟠 **High** — visible UX rough edge
- 🟡 **Medium** — polish
- 🟢 **Low** — nice-to-have

## Verified findings & fixes

### 🔴 V1 — Footer property filter links were silently broken
**Where:** `src/components/Footer.tsx:9-13`
**Why:** Used `?type=beach-house` (hyphen, wrong key). `/properties` reads
`property_type` and the enum uses underscores (`beach_house`), so every
"Beach Houses / Apartments / Villas / Cottages" link landed on the
unfiltered properties page.
**FIXED** — rewrote to `?property_type=<snake_case_value>`.

### 🔴 V2 — Footer boat filter links were silently broken
**Where:** `src/components/Footer.tsx:19-22`
**Why:** Used `?type=sport-fisher` / `?trip=deep-sea` / `?trip=reef`. The
`/boats` page reads `boat_type` / `trip_type`, the enum uses underscores,
and `reef` / `deep_sea` aren't in the `trip_type` enum (they're `boat_type`).
**FIXED** — Sport Fishing → `?boat_type=sport_fisher`, Dhow Trips →
`?boat_type=dhow`, Deep Sea Fishing → `?boat_type=deep_sea`, Reef Fishing →
`?boat_type=glass_bottom` (glass-bottom boats = reef tours in Watamu).

### 🔴 V3 — `/booking/[id]` and `/booking/success` queried columns that don't exist
**Where:** `src/app/booking/[id]/BookingClient.tsx:365` and
`src/app/booking/success/page.tsx:56`
**Why:** Both selects ask PostgREST for `property:wb_properties(name, location, image_url)`
and `boat:wb_boats(name, image_url)`. Neither table has `location` or
`image_url` columns (verified against Supabase information_schema). Any
real user hitting the checkout or success page would have seen "Booking
not found" because PostgREST errors on unknown columns.
**FIXED** — replaced `location` with `city` on properties, dropped
`image_url` entirely, and read cover images from the `wb_images` join
that both pages already had available. Fallbacks to stock images preserved.

### 🟠 V4 — Homepage has no explicit metadata
**Where:** `src/app/page.tsx`
**Why:** Not a real bug — the root `layout.tsx` provides a `metadata.title.default`
of "Watamu Bookings — Book stunning properties and fishing charters in Watamu, Kenya"
which is used when a page doesn't export its own. **NO ACTION** (flagged as
false positive, leaving as-is).

### 🟠 V5 — `scroll-behavior: smooth` ignores `prefers-reduced-motion`
**Where:** `src/app/globals.css:59` and `@keyframes` blocks
**Why:** Users with "reduce motion" OS setting still see smooth scroll +
animations. WCAG 2.3.3 concern.
**FIXED** — added a `@media (prefers-reduced-motion: reduce)` block that
disables scroll smoothing and shortens animation/transition durations.

### 🟠 V6 — Navbar mobile hamburger button is small (< 44×44 touch target)
**Where:** `src/components/Navbar.tsx:151`
**Why:** `p-2` gives ~32×32 clickable area on mobile.
**FIXED** — bumped to `p-3` + explicit `h-11 w-11` so the hit area clears
the 44px target.

### 🟡 V7 — Lightbox missing `role="dialog"` / `aria-modal`
**Where:** `src/components/ImageGallery.tsx` (lightbox overlay)
**FIXED** — added `role="dialog" aria-modal="true" aria-label="Image gallery"`.

### 🟢 V8 — Skip-to-content link missing
**Where:** `src/app/layout.tsx`
**FIXED** — added a visually-hidden "Skip to main content" link that
becomes visible on keyboard focus; jumps past the navbar to `#main`.
`src/components/Navbar.tsx` wrapper is above main, so main gets an id.

## False positives caught (do NOT "fix")

- **Booking double-submit race** (agent: no `disabled` on Book button) —
  FALSE. `PropertyBookingSidebar.tsx:358`, `BoatBookingSidebar.tsx:302`,
  and `BookingClient.tsx:208` all have `disabled={isSubmitting}` already.
- **Enquiry respond token replay** (agent: no replay guard) — FALSE.
  `/booking/[id]/respond/page.tsx:45,57` renders an "Already resolved"
  state when `status !== 'enquiry'`, and the POST burns the token on
  first accept (`route.ts:147`).
- **Tides / Map metadata missing** — FALSE. Both have `layout.tsx` files
  that export metadata (they're client components so page-level metadata
  isn't possible; layout pattern is correct).
- **Homepage missing metadata** — FALSE. Root layout sets a `default`
  title that covers the homepage.
- **EarningsCalculator missing** — FALSE (from audit v1).
- **Lightbox CSS missing** — FALSE (from audit v1); defined at
  `globals.css:170`.

## Known open (not a demo-breaker)

- iCal `/api/ical/import` fetches `feed.external_url` without re-running
  it through `sanitiseUrl()` from `src/lib/import/shared.ts`. Risk is
  limited to a compromised host account storing an internal URL. Fix
  post-demo.
- `/api/cron/billing` allows unauthenticated access when `CRON_SECRET`
  is unset in dev. Vercel production has the secret, so prod is safe.
  Worth tightening to fail-closed but not blocking.
- Availability race: `wb_check_property_availability` /
  `wb_check_boat_availability` only block on `status='confirmed'`; two
  guests in Stripe checkout for the same dates is possible.
