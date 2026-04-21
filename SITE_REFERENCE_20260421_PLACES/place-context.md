# Place context

How the current request's place is resolved and threaded through the app.

## Layers

```
request
  │
  ▼
middleware.ts          ── sets x-wb-host + x-wb-place headers
  │
  ▼
layout.tsx (server)    ── calls getCurrentPlace(), emits per-place <meta>
  │                        wraps children in <BrandProvider>
  ▼
server pages           ── call getCurrentPlace() / requireCurrentPlace()
  │                        filter queries by place.id
  ▼
client components      ── call useBrand() for brand + place name
```

The middleware sets request headers so server components never need to
re-parse the request URL; `getCurrentPlace()` is the single source of
truth for any server-side code that cares about the current place.

## `src/middleware.ts`

Three jobs, in this order:

1. **Supabase session refresh.** Unchanged by the places refactor — every
   request still round-trips the Supabase cookies.
2. **Place resolution.** Computes the current place slug from host + path
   and writes it to the request *and* response headers.
3. **Legacy subdomain rewrite.** `unreel.watamu.ke → /s/unreel`, unchanged.

### Constants

- `MULTI_PLACE_HOSTS = {'kwetu.ke', 'www.kwetu.ke'}` — hosts where the
  first path segment is a place slug. Everything else is single-place.
- `PLACE_SLUGS = {'watamu', 'malindi', 'kilifi', 'kilifi-county', 'vipingo'}`
  — mirror of the seeded `wb_places.slug` set. Must be updated in code
  *and* DB when adding a new place; middleware won't accept a slug that
  isn't in this set even if the row exists.
- `HOST_PLACE = { 'watamubookings.com': 'watamu', 'localhost': 'watamu',
  … }` — fixed place for single-place hosts. Skips a DB hit in hot path.
- `PLACE_HEADER = 'x-wb-place'`, `HOST_HEADER = 'x-wb-host'` — request
  header names, re-exported from `src/lib/places/context.ts` so both
  sides agree.

### Resolution rules

```
host = normaliseHost(request.headers.host)    // lowercased, port stripped

if host in MULTI_PLACE_HOSTS:
    seg = pathname.split('/')[1]
    placeSlug = seg if seg in PLACE_SLUGS else null
else:
    placeSlug = HOST_PLACE[host]              // usually 'watamu'
```

Headers written to both `request.headers` (so server components see them
via `next/headers`) and `supabaseResponse.headers` (so downstream caches
see them).

## `src/lib/places/context.ts`

Server-only module that reads the headers set by middleware and resolves
them into full `Place` + `PlaceHost` rows. All server pages + API routes
funnel through here.

### `getCurrentPlace()`

Returns `{ place: Place | null, host: PlaceHost }`. Precedence:

1. `x-wb-place` header → `wb_places.slug = <slug>` lookup.
2. `wb_place_hosts.place_id` for the current host.
3. Watamu-shaped safety fallback if the DB call fails *and* the host
   string contains `'watamu'` — this keeps watamubookings.com rendering
   during build/deploy when Postgres is briefly unreachable.

`place` is `null` on multi-place shells (`kwetu.ke/`) until the user
picks a place; UI treats that as "show place picker".

### `requireCurrentPlace()`

Same as above but throws if `place` is null. Use on pages that assume a
concrete place (everything under single-place hosts; kwetu.ke pages that
are already nested under `/[place]/…`).

### `listActivePlaces()` / `listAllPlaces()` / `getPlaceBySlug()`

Helpers for the place picker (`/`) and admin CRUD. `listActivePlaces()`
filters out `kind = 'county'` so the dropdown shows towns only (Kilifi
County is the parent of Kilifi/Watamu/etc. — not itself bookable).

### Fallback constant

`WATAMU_FALLBACK` is a fully-formed Watamu `Place` literal inside the
module. Only used when the DB is unreachable during a build (so
`next build` doesn't crash when Supabase is down). Safe because
watamubookings.com is guaranteed to be Watamu forever.

## `src/lib/places/BrandProvider.tsx`

Server-to-client bridge. Server layout resolves the place, builds a
`Brand` object, and passes it into `<BrandProvider>`. Any client component
under the tree calls `useBrand()` to read it.

### Brand shape

```ts
interface Brand {
  name: string;          // host.brand_name — "Watamu Bookings" | "Kwetu"
  short: string;         // host.brand_short — "Watamu" | "Kwetu"
  supportEmail: string | null;
  supportWhatsapp: string | null;
  placeName: string;     // place?.name ?? host.brand_short
}
```

`placeName` is the important one for dashboard forms: a host on Watamu
Bookings always sees `"Watamu"`; on kwetu.ke/malindi it sees `"Malindi"`;
on the kwetu.ke shell (no place picked) it sees `"Kwetu"` (the brand
short) as a sensible human-readable fallback.

### `useBrand()` fallback

If called outside a `<BrandProvider>` (tests, storybook, a component
accidentally mounted server-side without context), returns hardcoded
Watamu Bookings defaults instead of throwing. Safe because the site's
oldest and largest brand owns the defaults; anyone running `useBrand()`
in a new-brand context without the provider has a bug, but the fallback
prevents a white-screen.

## Where `getCurrentPlace()` is called

- `src/app/layout.tsx` — once per request, to build brand + metadata.
- `src/app/generateMetadata()` in page.tsx files that override titles
  (e.g. `/properties`, `/boats`, `/tides`).
- Every server page that lists properties, boats, or activities.
- Every API route that writes or reads place-scoped data
  (`/api/import/*`, `/api/ical/*`, booking endpoints).
- `src/app/invoice/[id]/page.tsx` for brand + hostname in invoices.
- `src/app/dashboard/billing/page.tsx` for brand in pricing copy.

Note: server route handlers call `getCurrentPlace()` inside the handler,
not at module scope — `headers()` is only valid per-request.
