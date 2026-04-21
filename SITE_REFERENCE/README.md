# SITE_REFERENCE — frozen as of 2026-04-21

Purpose: a known-good snapshot of every page and feature on watamubookings.com, so that
if something regresses in future you (or Claude) can diff against this reference and
restore behaviour.

## Rules

- **Do not edit files in this folder.** The folder is marked read-only (`chmod a-w`).
- If you need to refresh the snapshot, create a sibling folder `SITE_REFERENCE_YYYYMMDD/`
  instead. Never overwrite the existing reference.
- If you're a future Claude session: read `routes/public.md`, `routes/host.md`,
  `routes/admin.md`, `routes/api.md` and `functionality.md` before making map, filter,
  booking, or billing changes.

## Contents

- `routes/public.md` — public-facing pages (/, /properties, /boats, /map, etc.)
- `routes/host.md` — /dashboard/* host tools
- `routes/admin.md` — /admin/* pages
- `routes/api.md` — every API route with method, body, return shape, and key logic
- `routes/special.md` — sitemap, robots, error boundary, not-found
- `functionality.md` — cross-cutting concerns: auth, payments, images, SEO, DB tables,
  RLS, RPC functions, env vars
- `capture-screenshots.mjs` — Playwright script Barny can run locally to grab PNGs of
  every page (sandbox can't install chromium, so it's shipped as a script instead)

## How to capture screenshots (run locally)

```
cd /Volumes/BTJ_ONE/Projects/watamu-bookings-fresh
npx playwright install chromium     # first time only
node SITE_REFERENCE/capture-screenshots.mjs
```

Output lands in `SITE_REFERENCE/screenshots/` (ignored by git via `.gitignore` so the
reference folder stays slim).

## Provenance

Built from a full route inventory crawled 2026-04-21 after the enquiry flow + AI
import wizard shipped, post-DB migration. Everything documented here was verified to
exist in the repo at that point.
