# SITE_REFERENCE_20260421_PLACES — places refactor snapshot

Sibling snapshot to `SITE_REFERENCE/` documenting the multi-place restructure
that shipped 2026-04-21. The original SITE_REFERENCE is still authoritative
for route-by-route behaviour; this folder captures the **new places layer**
that sits on top of it.

## Why this snapshot exists

Barny acquired `kwetu.ke` as the domain for a nationwide Kenya expansion.
Rather than fork the codebase per town, every location is now a first-class
"place" row in the database and the app resolves the current place from the
request host + path. `watamubookings.com` keeps behaving as a Watamu-only
site; `kwetu.ke` acts as a multi-place shell (`/watamu/...`, `/malindi/...`,
etc.); future sibling hosts (e.g. `kilifihouses.ke`) plug in via the
`wb_place_hosts` table.

No user-facing change should be visible on watamubookings.com today. The
refactor is a structural one.

## Rules

- **Do not edit files in this folder.** Like `SITE_REFERENCE/`, this is a
  frozen reference.
- Every page documented here was verified against the repo at commits
  `ca2d095`, `f32a3ec`, `2120cf0`, and `b19262e` (the four places-refactor
  checkpoints merged to master on 2026-04-21).

## Contents

- `places-model.md` — `wb_places`, `wb_place_hosts`, `wb_boat_places`
  schema + backfill strategy
- `place-context.md` — middleware, `getCurrentPlace()`, `BrandProvider`,
  `useBrand()` hook
- `route-deltas.md` — what changed per route (public, host, admin, api)
- `brand-env-vars.md` — env vars that drive brand/place resolution for
  server-only contexts (cron, emails, Stripe, M-Pesa)

## Provenance

Built after the four-commit places refactor landed on master:

- `ca2d095 feat(places): add wb_places model + host-aware place context`
- `f32a3ec feat(places): filter listings + SEO by place context`
- `2120cf0 feat(places): place-aware tides + activities pages`
- `b19262e feat(places): brand-aware dashboard + auth + legal pages + emails`

`tsc --noEmit` passes clean at `b19262e`.
