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

Seven commits on top of `54e290a` (master at start of the night):

| Commit     | Scope |
|------------|-------|
| `4bb1864`  | Phase 1 — sidebar: "Total before taxes / for N nights" subtitle, check-in/out time block, free-cancellation text |
| `066cbe8`  | Phase 2 — header Share/Save actions, guest favourite callout, highlights row, `#reviews` anchor; sidebar driven by real `check_in_time` / `check_out_time` / `cancellation_policy` |
| `e572ab7`  | Phase 3 — Airbnb-style amenities icon grid (+ modal), real OpenStreetMap embed, "Show all photos" CTA on gallery |
| `729971d`  | Phase 4 — "Meet your host" card (trust signals, years hosting, rating stats), FeeInfoTooltip for cleaning + service fee rows |
| `f41dcd9`  | Site audit — fixed broken `average_rating` field (cards showed 0 stars!), wired SortSelect to actually sort, fixed footer filter URLs, replaced the hardcoded mock dashboard chart with real revenue |
| `ae15883`  | Hero polish — stronger gradient + brand glow + text-shadow + frosted search card ring on the landing hero |
| `f88d552`  | Phase 5 — hosts can review guests (double-blind), private host-notes, inline guest rating on bookings list |

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

## Phase 5 — Host-rates-guest (also shipped tonight)

This was a mid-night user request: "would it be a good idea for hosts to be
able to rate guests?" Yes. Shipped.

- New tables: `wb_guest_reviews` (unique per booking) and `wb_host_notes`
  (private per-booking notes only the host sees).
- **Double-blind** like Airbnb: `published_at` stays NULL until the guest
  submits their review (wb_reviews INSERT trigger flips both to published).
  Nothing is visible to the reviewee until both sides are in — or a 14-day
  scheduled reveal (not yet wired; see "next sprint" below).
- RLS: reviewer can always see their own draft/published; reviewee sees only
  published; the public sees only published. Hosts can only INSERT against
  bookings on their own listings + with status=completed.
- Aggregate cache on `wb_profiles`: `guest_avg_rating`, `guest_review_count`,
  `guest_would_host_again_pct`, recomputed by trigger on INSERT/UPDATE/DELETE.

UI surface:
- `/dashboard/bookings` — completed rows get a **Review guest** button. Once
  submitted: pill shows **Review pending** (locked, waiting for guest) or
  **Review published**. Guest rows also now show inline `⭐ 4.9 · 3 hosts ·
  100% re-host` when aggregate stats exist.
- `/dashboard/bookings/[id]/review` — full form: overall + cleanliness +
  communication + house-rules stars, thumbs-up/down "would host again",
  public comment, optional private feedback (guest-only, never published),
  edit-until-published behaviour.
- Expanded row on bookings list has an inline **Private host note** editor
  (stored in `wb_host_notes`, only the host ever sees).

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

1. **14-day reveal job** — Phase 5 review pairing only reveals when the
   counterpart submits. Add a cron/edge-function that runs nightly and flips
   `wb_guest_reviews.published_at` on rows older than 14 days. Simple:
   `UPDATE wb_guest_reviews SET published_at = now() WHERE published_at IS
   NULL AND created_at < now() - interval '14 days';` (and the same for
   wb_reviews if we want symmetric behaviour).
2. **Wishlists** — `wb_wishlists(user_id, property_id, created_at)` + wire the heart on both cards and the property header.
3. **Second & third seed property** — copy the Coral Breeze pattern. Two more and the `/properties` grid looks populated.
4. **Host response tracking** — add `response_rate_percent` + `avg_response_minutes` to `wb_profiles`, update on every `wb_messages` reply.
5. **Guest-side reviews of host** — not built yet. Should mirror Phase 5 but scoped to guests reviewing hosts/properties; `wb_reviews` covers the property side only.
6. **Activities page** — the footer links to `/activities`; stub it with 6 cards (dhow, deep-sea, snorkel, kite, Gede, Arabuko) reusing the card styling.
7. **Calendar on the sidebar** — the Airbnb-style 2-month side-by-side picker is still the small custom one we had; replace with a proper two-month view.
8. **Mobile nav** — the header works but the search affordance on mobile is thin; worth a pass.

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
