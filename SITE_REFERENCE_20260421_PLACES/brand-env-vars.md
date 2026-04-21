# Brand environment variables

Env vars that drive brand/place identity in contexts where
`getCurrentPlace()` can't run (no request, no headers). These are the
fallback source of truth for cron jobs, transactional emails, Stripe
PaymentIntents, M-Pesa STK Push, and any module-scope constants that
load before a request arrives.

## Why env vars and not the DB

`getCurrentPlace()` relies on `headers()` from `next/headers`, which is
only available inside a request. A deployment that sends email from a
cron job, a Stripe webhook, or a Postgres-triggered function has no
request context — so brand identity has to come from the environment.

One deployment = one brand. `watamubookings.com` and `kwetu.ke` are
separate Vercel projects with their own env. Multi-place on kwetu.ke is
handled within a single deployment via `getCurrentPlace()`; the env vars
below configure the deployment's default brand.

## Variables

### `NEXT_PUBLIC_BRAND_NAME`

Full-text brand, e.g. `"Watamu Bookings"` or `"Kwetu"`.

**Used by:**

- `src/lib/mpesa.ts` — `TransactionDesc` in STK Push payload (what the
  customer sees on their M-Pesa confirmation SMS).
- `src/lib/stripe.ts` — PaymentIntent `description` (appears on card
  statement).
- `src/lib/email/templates.ts` — outer HTML shell of every transactional
  email (header + footer).
- `src/lib/email/enquiry-templates.ts` — same for enquiry emails.
- `src/app/api/ical/import/route.ts` — outbound `User-Agent` when we
  fetch Airbnb / Booking.com / Google calendars.

**Default if unset:** `"Watamu Bookings"` (or `"WatamuBookings"` for the
iCal User-Agent, no space).

### `NEXT_PUBLIC_BRAND_SLUG`

Short machine identifier, e.g. `"watamu_bookings"` or `"kwetu"`.

**Used by:**

- `src/lib/stripe.ts` — `metadata.platform` on every PaymentIntent so
  Stripe Dashboard can filter by deployment.

**Default if unset:** `"watamu_bookings"`.

### `NEXT_PUBLIC_BRAND_PLACE`

Default place *name* (not slug) for places-less contexts. e.g.
`"Watamu"`.

**Used by:**

- `src/lib/email/enquiry-templates.ts` — "other hosts in
  `${BRAND_PLACE}`" copy in the rejection/alternatives email (no request
  context because emails are queued by cron after booking state
  transitions).

**Default if unset:** `"Watamu"`.

### `NEXT_PUBLIC_SITE_URL`

Canonical https URL of the deployment, no trailing slash. e.g.
`"https://www.watamubookings.com"` or `"https://kwetu.ke"`.

**Used by:**

- `src/lib/jsonld.ts` — base URL for structured data `@id` values.
- `src/app/sitemap.ts` — absolute URLs in sitemap entries.
- `src/app/robots.ts` — `Sitemap:` line in robots.txt.
- `src/app/layout.tsx` — `metadataBase` + `openGraph.url` for Open Graph
  tags.
- `src/lib/email/templates.ts` + `enquiry-templates.ts` — links back
  into the app from emails (booking page, listing page, dashboard).
- `src/app/api/bookings/route.ts` + `bookings/[id]/respond/route.ts` —
  links in notifications sent when a booking is created / responded to.

**Default if unset:** `"https://watamubookings.com"` (or the `www.`
variant in a couple of places — check the file for the exact default).

## Per-deployment values

### watamubookings.com

```
NEXT_PUBLIC_BRAND_NAME=Watamu Bookings
NEXT_PUBLIC_BRAND_SHORT=Watamu
NEXT_PUBLIC_BRAND_SLUG=watamu_bookings
NEXT_PUBLIC_BRAND_PLACE=Watamu
NEXT_PUBLIC_SITE_URL=https://www.watamubookings.com
```

### kwetu.ke (multi-place shell)

```
NEXT_PUBLIC_BRAND_NAME=Kwetu
NEXT_PUBLIC_BRAND_SHORT=Kwetu
NEXT_PUBLIC_BRAND_SLUG=kwetu
NEXT_PUBLIC_BRAND_PLACE=Kenya
NEXT_PUBLIC_SITE_URL=https://kwetu.ke
```

`BRAND_PLACE` on kwetu.ke is `"Kenya"` rather than a specific town
because enquiry emails from a multi-place shell don't have a resolved
place when queued (the cron worker doesn't see request context). If the
site ever adds place-specific enquiry emails they should be queued with
the place name in the job payload rather than read from env.

## Not-env-driven (but brand-adjacent)

These read from the DB via `wb_place_hosts`, not from env vars:

- `host.brand_name` / `host.brand_short` used in server components.
- `host.support_email` / `host.support_whatsapp` used in footer + auth
  pages.
- `host.default_og_image` — per-host OG image fallback.

The DB is the canonical source when a request exists; env vars are the
fallback when one doesn't.

## M-Pesa / Stripe-specific env vars

Not brand vars strictly, but listed here because they differ per
deployment:

- `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CONSUMER_KEY`,
  `MPESA_CONSUMER_SECRET`, `MPESA_CALLBACK_URL`, `MPESA_ENV`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`

kwetu.ke will need its own Daraja app + Stripe account before going live
with bookings on non-Watamu places.
