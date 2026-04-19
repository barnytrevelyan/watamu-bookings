# Overnight handoff — Watamu Bookings

Last worked: night of 18 → 19 April 2026. Branch: `master`. Every commit
below has been pushed to GitHub and verified with `tsc --noEmit` and
`next build` before push.

## TL;DR for the demo

Open **http://localhost:3000/properties/coral-breeze-villa** (or Vercel
preview) and walk the client down the page in order. That page is the
show-stopper — it was rebuilt to Airbnb parity tonight.

Then show **/properties** (filters + sort), **/** (home hero +
featured), and **/dashboard** (new real-revenue chart).

## What shipped tonight

Five commits on top of `54e290a` (master at start of the night):

| Commit     | Scope |
|------------|-------|
| `4bb1864`  | Phase 1 — sidebar: "Total before taxes / for N nights" subtitle, check-in/out time block, free-cancellation text |
| `066cbe8`  | Phase 2 — header Share/Save actions, guest favourite callout, highlights row, `#reviews` anchor; sidebar driven by real `check_in_time` / `check_out_time` / `cancellation_policy` |
| `e572ab7`  | Phase 3 — Airbnb-style amenities icon grid (+ modal), real OpenStreetMap embed, "Show all photos" CTA on gallery |
| `729971d`  | Phase 4 — "Meet your host" card (trust signals, years hosting, rating stats), FeeInfoTooltip for cleaning + service fee rows |
| `f41dcd9`  | Site audit — fixed broken `average_rating` field (cards showed 0 stars!), wired SortSelect to actually sort, fixed footer filter URLs, replaced the hardcoded mock dashboard chart with real revenue |

Demo data seeded tonight on Coral Breeze Villa: 12 photos, 22 amenities,
4 rooms, 8 authentic-sounding reviews from 8 guests (trigger put the
avg rating at 4.9, above the "guest favourite" threshold). Host profile
on Barny is now verified + has a proper bio + business name.

## The one-line walk-through

1. **Hero + gallery** — 5-up grid with "Show all photos" pill bottom-right.
2. **Badges + share/save** — top-right of the title row, Share uses native share sheet on mobile.
3. **Rating row** — click "(8 reviews)" and it scrolls to the reviews section.
4. **Guest favourite callout** — rose/amber gradient. Only shows when rating ≥ 4.8 AND reviews ≥ 5.
5. **Highlights** — Self check-in, Great location (4.9/5), Free cancellation.
6. **About this property** — new rich multi-paragraph description.
7. **What this place offers** — 10 icons in 2 columns, "Show all 22 amenities" opens a modal grouped by category.
8. **Rooms** — 4 seeded (Master Suite / Ocean View Suite / Garden Room / Twin).
9. **Where you'll be** — real OpenStreetMap with marker + "View larger map" deep link.
10. **Meet your host** — Barny card with superhost badge, stats, bio, "Contact host" CTA.
11. **Reviews** — 5-bar distribution + all 8 cards, including owner responses.
12. **Sidebar** — price × nights, cleaning (hidden if 0), **Service fee (ℹ️ — tooltip)**, total, book button, check-in/out times, cancellation terms.

## Known rough edges (call these out yourself if asked)

- **"Contact host" button** is `mailto:` only — proper in-app messaging is not built. Deliberate.
- **Save to wishlist** is client-state only — doesn't persist or require auth. Deliberate; we haven't built `wb_wishlists` yet.
- **Response rate / languages spoken** on the host card are currently platform defaults ("100%", "English & Kiswahili"). We don't yet track response stats or language fields on `wb_profiles`; add columns + UI when ready.
- **Activities page** (`/activities`) is linked from the footer but doesn't exist yet. If asked, say "coming next sprint".
- **Only one property seeded**. The `/properties` grid will show a single card. If the client wants to see the grid populated, seed a second villa using the same pattern from `supabase/execute_sql` — script below.
- **Map approximation**: intentionally shows a rough bbox not the exact point (Airbnb pattern for privacy). Exact pin is sent after booking.

## If anything breaks at 8am

1. Check the Vercel deployment logs — all env vars should be set there.
2. If the property page 404s, run `SELECT slug, is_published FROM wb_properties WHERE slug='coral-breeze-villa';` — it must be `is_published = true`.
3. If images are missing, confirm `wb_images` has 12 rows with `property_id = '6fe8ad25-f98e-43b8-80cd-cc6773970326'`.
4. To reset the rating, DELETE a review; the `trg_wb_update_rating` trigger will recompute `avg_rating` and `review_count` on `wb_properties`.

## Suggested next sprint (in priority order)

1. **Wishlists** — `wb_wishlists(user_id, property_id, created_at)` + wire the heart on both cards and the property header.
2. **Second & third seed property** — copy the Coral Breeze pattern. Two more and the `/properties` grid looks populated.
3. **Host response tracking** — add `response_rate_percent` + `avg_response_minutes` to `wb_profiles`, update on every `wb_messages` reply.
4. **Activities page** — the footer links to `/activities`; stub it with 6 cards (dhow, deep-sea, snorkel, kite, Gede, Arabuko) reusing the card styling.
5. **Calendar on the sidebar** — the Airbnb-style 2-month side-by-side picker is still the small custom one we had; replace with a proper two-month view.
6. **Mobile nav** — the header works but the search affordance on mobile is thin; worth a pass.

## How to run locally

```bash
git pull
npm install
cp .env.example .env.local  # fill in Supabase URL + anon key + service role
npm run dev
```

Open http://localhost:3000/properties/coral-breeze-villa.

Good luck in the morning — every phase is live on `master` and the
property page is genuinely strong now. 🌅
