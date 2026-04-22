# REGRESSION_GUARD.md

**Purpose:** A load-bearing list of invariants, canonical helpers, and landmines for the Watamu Bookings codebase. Read this before making non-trivial changes — especially before rewriting or "cleaning up" any of the named files.

Last ground-truthed: 2026-04-22 (commission-only U-turn).

---

## 1. Stack summary

- **Framework:** Next.js 14.2.3 (App Router). `next.config.js` sets `typescript.ignoreBuildErrors = true` and `eslint.ignoreDuringBuilds = true`. Local gate is `npm run type-check` (`tsc --noEmit`) — it MUST be clean before shipping.
- **Auth + DB:** Supabase (`@supabase/ssr@0.3.0`, `@supabase/supabase-js@2.43.0`). Project: `jiyoxdeiyydyxjymahrh` (WatamuBookings, eu-central-1). RLS is enabled on every `wb_*` table.
- **Payments:** Stripe + M-Pesa Daraja (commission-only, Kenyan phones via M-Pesa). Every booking goes through a payment flow — there is no enquiry/subscription branch.
- **Email:** ZeptoMail via `src/lib/email/zeptomail.ts`. Templates in `src/lib/email/templates.ts`.
- **AI import:** OpenAI `gpt-4o` (generic) or `gpt-4o-mini` (platform paid); falls back per-source (airbnb / booking.com / fishingbooker have dedicated scrapers).
- **Hosting:** Vercel. Branch: `master`. No billing cron — all revenue is commission taken per-booking.

## 2. Must-not-touch zones

These exist because of production incidents. If you touch them, explain why in the PR and test carefully.

### `src/lib/import/auth.ts` — `resolveImportUser`

This helper solves a production 401 regression on `/dashboard/import` caused by `@supabase/ssr@0.3` failing to decode chunked (`.0`/`.1`) or `base64-`-prefixed auth cookies inside route handlers.

**Invariant:** Every `src/app/api/import/**/route.ts` MUST use `resolveImportUser(request)` for auth. Do NOT replace it with `supabase.auth.getUser()` alone. The SSR path is the primary; the manual-JWT fallback is the safety net.

### Dedicated scrapers

`src/app/api/import/airbnb/route.ts`, `.../booking-com/route.ts`, `.../fishingbooker/route.ts` — these are working and fragile. The HTML selectors were tuned against real listings. Do NOT "refactor" them into the generic scraper. If a site changes its DOM, patch in place.

The generic scraper (`.../generic/route.ts`) uses `gpt-4o` and is the fallback.

### SSRF guards on import routes

Every scraper has an `isAllowedXUrl()` check that validates `protocol === 'https:'` and a hostname regex. **Never remove or loosen these** — without them the user-supplied URL goes straight to `fetch()` and can hit internal metadata endpoints (e.g. 169.254.169.254).

### Stripe webhook signature verification

`src/app/api/webhooks/stripe/route.ts` must use the raw body (`await request.text()`), not parsed JSON. Breaking the raw-body path breaks signature verification silently.

## 3. Booking flow — single path

Every booking is a commission booking. At creation a booking is `pending_payment`; once Stripe/M-Pesa confirms, it flips to `confirmed`. The platform takes its 7.5% on confirmed bookings (surfaced to hosts on `/dashboard/earnings`).

The `wb_booking_status` enum still carries legacy `enquiry` and `declined` values and `wb_properties.billing_mode` / `wb_boats.billing_mode` columns are still present (pinned to `'commission'`) — left in place by the 2026-04-22 U-turn migration so in-flight rows don't break. New code must not set or branch on those values; a later migration can drop them.

## 4. Commission rate — 7.5%

The canonical rate is **7.5%** (750 basis points). Sources that must match:

- DB: `wb_settings.billing.commission_rate_bps = 750`.
- Server-side calculation: `src/app/dashboard/earnings/page.tsx` (`COMMISSION_RATES.kwetu = 0.075`).
- Admin revenue card: `src/app/admin/page.tsx` (`COMMISSION_RATE = 0.075`).
- Marketing copy: `/become-a-host`, `/about`, `/contact`.

See the `project_commission_rate.md` memory. If you change the rate, update every site above and add a migration that updates the `wb_settings` row.

## 5. Database — schema landmines

### `wb_properties` + `wb_boats`

Both have: `is_published` (boolean — controls public visibility), `status` (text — 'draft' / 'pending_review' / 'published' / 'rejected'), `is_featured`, `slug` (UNIQUE), `owner_id` (FK to `wb_profiles.id`). Legacy `billing_mode` and `deposit_percent` columns remain in the schema (pinned to `'commission'` / default) but are unused by the app post-2026-04-22.

Public list queries filter `is_published=true`. Status is for admin workflow. They are NOT interchangeable.

### `wb_bookings`

Single table handles both property and boat bookings (`listing_type` enum). **Required fields depend on `listing_type`:**

- `property` bookings: `property_id`, `check_in`, `check_out`
- `boat` bookings: `boat_id`, `trip_date`, usually `trip_id`

Legacy enquiry fields (`enquiry_token`, `host_responded_at`, `host_decline_reason`, `booking_mode`, `deposit_amount`) still exist on the table but are no longer populated — do not read or set them in new code.

### `wb_images` — polymorphic

`listing_type` + one of `property_id` / `room_id` / `boat_id`. When inserting, set `listing_type` to match whichever FK you're using or the RLS policy will reject.

### `wb_amenities` vs `wb_property_amenities`

`wb_amenities` is the master catalog (23 rows). `wb_property_amenities` is the M2M join. Never delete from `wb_amenities` — always unlink via `wb_property_amenities`.

### `wb_boat_features` + `wb_boat_feature_links`

Same pattern for boats (22 features). The link table PK is `(boat_id, feature_id)` composite — use UPSERT with `ignoreDuplicates: true` when adding.

## 6. Enum value landmines

- `wb_property_type`: `villa` | `apartment` | `cottage` | `house` | `hotel` | `banda` | `penthouse` | `bungalow` | `studio` | `beach_house`
- `wb_boat_type`: `deep_sea` | `sport_fisher` | `dhow` | `catamaran` | `speedboat` | `glass_bottom` | `kayak` | `sailboat`
- `wb_trip_type`: `half_day` | `half_day_morning` | `half_day_afternoon` | `full_day` | `overnight` | `multi_day` | `sunset_cruise` | `custom`
- `wb_booking_status`: `pending_payment` | `confirmed` | `cancelled` | `completed` | `refunded` (the `enquiry` and `declined` values still exist in the enum but are unused post-2026-04-22)
- `wb_user_role`: `admin` | `owner` | `guest`

Adding a new value = migration + TypeScript union update in `src/lib/types.ts` + UI surface (select options, filter chips, labels) + any switch/default handling.

**Gotcha:** filter UIs accept `trip_type=half_day` to cover all three half-day variants (see `src/app/boats/page.tsx:55-57`). Preserve this fan-out if you refactor.

## 7. Server components vs client components

- Every route under `src/app/**/page.tsx` defaults to **server component**. They CAN be `async` and CAN use the server Supabase client.
- Any file with `"use client"` at top MUST NOT import `@/lib/supabase/server`. It MUST use `@/lib/supabase/client`.
- `searchParams` in page props is a **Promise** (Next 15 pattern already adopted): `{ searchParams: Promise<SearchParams> }`. Await it.

## 8. Canonical helpers — always reuse

| Need | Use |
|---|---|
| Server Supabase client | `import { createClient } from '@/lib/supabase/server'` |
| Browser Supabase client | `import { createClient } from '@/lib/supabase/client'` |
| Service-role (admin) Supabase | `import { createAdminClient } from '@/lib/supabase/admin'` (server-side only!) |
| Import-route auth | `import { resolveImportUser } from '@/lib/import/auth'` |
| Email send | `import { sendTransactional } from '@/lib/email/zeptomail'` |
| Placeholder stock images | `import { getPropertyImage, getBoatImage, STOCK_IMAGES } from '@/lib/images'` |
| Types | `import type { Property, Boat, Booking, ... } from '@/lib/types'` |
| UI primitives | `@/components/ui/{Button,Card,Badge,Input,Textarea,StarRating,Tabs}` |

## 9. Design tokens — CSS variables

Define in `globals.css`. **Do not** hard-code these colors elsewhere; use the variables.

- Primary teal: `var(--color-primary-50..900)` (gradient hero backgrounds, CTAs)
- Sandy gold: `var(--color-sandy-50..800)` (accents, featured pills)
- Coral: `var(--color-coral-500)` (rare alerts, hearts)
- Success green: `var(--color-green-500..700)` (published, confirmed)
- Standard Tailwind for neutral (gray-*), amber (draft/pending), emerald (success confirmations), rose (error).

Gradient hero pattern reused across the site:
```
bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-sandy-50)]
```
Plus two blurred pointer-events-none decorative blobs with `opacity-30 blur-3xl`.

## 10. Environment variables (non-secret names)

See `.env.example` for the full list. Fail-loud at runtime on missing keys — do not silently fall back.

Required in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`, `MPESA_CALLBACK_URL`, `NEXT_PUBLIC_SITE_URL`, `WATAMU_AI_API_KEY`, `WATAMU_AI_PROVIDER`, `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_FROM_EMAIL`.

## 11. Cron jobs

No billing cron — commission is taken per-booking via the payment flow. `vercel.json` no longer declares a billing cron. If a new cron is added, keep the `Authorization: Bearer $CRON_SECRET` pattern established previously.

## 12. Security headers

Set in `next.config.js:async headers()`. Preserve all of them:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` with `payment=(self 'https://js.stripe.com')` — Stripe breaks if you drop this allowance.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

## 13. SEO + AI visibility contracts

- Root `src/app/layout.tsx` has the site-wide metadata with a `%s | Watamu Bookings` title template, OG image, Twitter card. **Do not remove.**
- Per-page `export const metadata: Metadata` lives in every public page. When adding a new public page, include title + description.
- `src/app/sitemap.ts` builds static + dynamic property/boat routes at runtime with 1-hour revalidate. Must succeed even if Supabase is unreachable (current code catches and returns static list — preserve).
- `src/app/robots.ts` disallows `/admin`, `/dashboard`, `/api/`, `/auth/`, `/booking/`. Do not allow these.
- Detail pages emit JSON-LD (LodgingBusiness / TouristAttraction for boats). When adding new detail pages, include structured data — it's what AI search engines read.

## 14. Known fragile flows — test these first after changes

1. **Login → dashboard → import**: auth cookie round-trip + `resolveImportUser`.
2. **Create property → publish → appears on `/properties`**: `is_published=true` gate.
3. **Stripe payment → webhook → booking `confirmed`**: raw-body signature verify.
4. **M-Pesa STK push → callback → booking `confirmed`**: callback URL must match `MPESA_CALLBACK_URL`.
5. **Earnings dashboard**: `/dashboard/earnings` must compute Kwetu / Airbnb / Booking.com net correctly from commission rates.
6. **Sitemap generation**: must not 500 if DB is down.
7. **Listing filters on `/properties` and `/boats`**: especially the half-day fan-out on boats.

## 15. File-level notes (short)

- `src/app/layout.tsx` — site-wide metadata + Toaster + Navbar + Footer. Do not add more top-level providers without thinking about server/client boundary.
- `src/components/Navbar.tsx` — client component; auth state comes from the browser Supabase client. It decides whether to show "Host dashboard" or "Become a host".
- `src/components/DashboardSidebar.tsx` — admin link only renders if `profile.is_super_admin`. Do not weaken that check.
- `src/app/api/webhooks/stripe/route.ts` + `src/app/api/webhooks/mpesa/route.ts` — webhook handlers; idempotent by design (check existing booking status before mutating).

## 16. Git + deploy workflow

- Local commit → `git push origin master` → Vercel auto-deploys.
- PAT is NOT stored in memory; Barny pastes it each session.
- Cowork sandbox blocks file delete by default — call `allow_cowork_file_delete` if `rm` fails with "Operation not permitted", especially for `.git/index.lock`.
- Author identity may need to be set per-repo: `git config user.email / user.name`.

---

## Change-log discipline

When an incident happens (something breaks in prod that should have been caught), add a section here describing what, why, and the canonical fix. Do not let this doc rot.
