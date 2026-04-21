# Places data model

## `wb_places`

One row per bookable location. Hierarchical via `parent_place_id` so Watamu
can live under Kilifi County under Kenya.

Key columns:

- `id` (uuid PK), `slug` (unique) — slug is the stable URL-safe identifier
  used in headers, middleware and kwetu.ke paths.
- `name` — human-readable, shown in copy and meta tags.
- `parent_place_id` — nullable self-reference.
- `kind` — `country | region | county | town | neighbourhood | marina`.
- `country_code` — default `'KE'`.
- `centroid_lat`, `centroid_lng` — map default centre for the place.
- `bbox_north|south|east|west` — optional bounding box for map fit.
- `default_zoom` — map zoom used on `/map` when this place is active.
- `timezone` — defaults to `Africa/Nairobi`.
- `hero_image_url`, `short_tagline`, `description` — homepage copy.
- `seo_title`, `seo_description` — drive `<title>` / `<meta>` via
  `generateMetadata()` in `src/app/layout.tsx`.
- `activities_json` — per-place activity list used by `/activities`.
- `map_pois_json` — per-place landmark pins used by `/map` (falls back to
  baked-in Watamu pins when empty).
- `is_active`, `sort_order`.

Indexes: slug (unique), `parent_place_id`, `is_active`.

## `wb_place_hosts`

Maps a request hostname to the default place and brand. Middleware and
`getCurrentPlace()` both consult this row (middleware uses the hard-coded
`HOST_PLACE` map for speed; the helper reads the DB for full branding).

Columns:

- `host` (PK) — lowercase hostname, e.g. `watamubookings.com`.
- `place_id` — nullable FK to `wb_places`. Multi-place shells leave this
  null and expect a place slug in the URL path.
- `brand_name` — full-text brand (`"Watamu Bookings"`, `"Kwetu"`).
- `brand_short` — short token used in the header accent and some fallbacks.
- `is_multi_place` — true iff the first path segment may be a place slug.
- `default_og_image`, `support_email`, `support_whatsapp` — per-host copy.

Seeded rows on 2026-04-21:

| host                        | place   | brand            | multi | email                      |
|-----------------------------|---------|------------------|-------|----------------------------|
| watamubookings.com          | Watamu  | Watamu Bookings  | false | hello@watamubookings.com   |
| www.watamubookings.com      | Watamu  | Watamu Bookings  | false | hello@watamubookings.com   |
| kwetu.ke                    | —       | Kwetu            | true  | hello@kwetu.ke             |
| www.kwetu.ke                | —       | Kwetu            | true  | hello@kwetu.ke             |
| localhost:3000 / localhost  | Watamu  | Watamu Bookings  | false | hello@watamubookings.com   |

## `wb_properties.place_id`

Nullable FK to `wb_places`. A property lives in exactly one place. The
backfill in the migration tagged every existing row as Watamu.

Every `/properties` query now filters by `place_id = <current place>` when
the current place is resolved (single-place hosts always resolve).

## `wb_boat_places`

Join table — a boat charter can operate from multiple places (e.g. a
Watamu-registered sport fisher that also runs out of Kilifi Creek). Primary
key is `(boat_id, place_id)` with an `is_primary` flag.

- `is_primary` — exactly one primary per boat (enforced by a partial unique
  index: `unique (boat_id) where is_primary`).
- Queries on `/boats` filter `exists (select 1 from wb_boat_places where
  boat_id = wb_boats.id and place_id = <current>)`.

Backfill tagged every boat with Watamu as primary.

## Seeded places

Rows inserted with `is_active = true` on 2026-04-21:

- Watamu (town, Kilifi County parent)
- Malindi (town)
- Kilifi (town)
- Kilifi County (county)
- Vipingo (town)

Inactive rows can be added in future without affecting the live site —
middleware only accepts slugs in the `PLACE_SLUGS` set (mirror kept in
code), so adding a place is a two-step process: insert row, then update
`src/middleware.ts`.
