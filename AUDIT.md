# Overnight audit — 2026-04-20

_Working log of findings. Each item is addressed in commit `<tbd>`._

## Severity

- 🔴 **Critical** — breaks demo or blocks checkout
- 🟠 **High** — visible UX rough edge
- 🟡 **Medium** — polish
- 🟢 **Low** — nice-to-have

## Findings

### Data / demo setup

- 🔴 **F1 — [TEST] listings were still published.** 3 properties + 1 boat with
  slug `test-*` were `is_published = true`. They would have appeared in the
  demo. **FIXED** — `UPDATE … SET is_published = false`.
- 🟠 **F2 — Demo listings had thin galleries.** Most had 2–4 images.
  **FIXED** — topped up each to 6–8 Unsplash photos (Watamu-relevant).
- 🟠 **F3 — Half the demo listings had 0 reviews.** Mwezi Penthouse, Pwani
  Studio, Pepo Catamaran, Kioo Glass-Bottom all empty. **FIXED** — added
  past bookings + reviews; every listing now has ≥2 reviews.
- 🟠 **F4 — Only 4 / 9 demo listings were featured.** Mwezi Penthouse, Pwani
  Studio, Pepo Catamaran, Kioo Glass-Bottom excluded from homepage.
  **FIXED** — featured all demo listings.

### Code / UX

- 🟠 **F5 — `/properties` and `/boats` sort select is dead.**
  `SortSelect` was a server component with `onChange={undefined}`. **FIXED**
  — extracted as a client component (`src/components/SortSelect.tsx`) using
  `useRouter` + `useSearchParams` + `useTransition`; navigates on change,
  resets pagination to page 1.
- 🟡 **F6 — Boats price sort was fake.** `/boats/page.tsx` case
  `price_asc/price_desc` fell through to `order('created_at')` and never
  post-sorted by trip price. **FIXED** — client-side sort on the fetched
  `boats[]` by `Math.min(...trips[].price_total)` after the DB query when
  `sort=price_asc|price_desc`.
- 🔴 **F7 — Hero & pages search button did nothing.** `SearchFilters`
  component's `onSearch` prop was optional and was NOT passed on
  `/` (homepage hero), `/properties`, or `/boats`. Clicking the big
  "Search Properties" / "Search Charters" CTA fired `onSearch?.()` which
  was undefined. **FIXED** — default behaviour now builds URLSearchParams
  and `router.push('/properties?…')` / `/boats?…`. Price-range options
  like `50000+` unpack cleanly into `min_price` (and `max_price` when
  present). `onSearch` callback still honoured if provided.
- 🟠 **F8 — Email address inconsistency.** `/contact` used
  `hello@watamubookings.com`. `Footer` and `/about` used
  `info@watamubookings.com`. **FIXED** — all three now use
  `hello@watamubookings.com` (matches `llms.txt`).
- 🟠 **F9 — WhatsApp number was placeholder.** `/contact` and
  `/become-a-host` hard-coded `+254 700 000 000` / `wa.me/254700000000`.
  **FIXED** — both now read `NEXT_PUBLIC_WHATSAPP_NUMBER`. If unset
  (current demo state), `/contact` swaps the WhatsApp+Phone cards for a
  "Response time" card, and `/become-a-host` shows an email CTA instead.
  Zero placeholder digits render.
- 🟢 **F10 (FALSE POSITIVE)** — `lightbox-overlay` CSS IS defined
  (`src/app/globals.css:170`). Agent was wrong; gallery is functional.
- 🟢 **F11 (FALSE POSITIVE)** — `EarningsCalculator` exists at
  `src/app/become-a-host/EarningsCalculator.tsx`. Agent was wrong.

### Verification (post-fix)

- `npx tsc --noEmit` → exit 0.
- `next build` → all 70+ routes compile; no client/server boundary errors.
- Supabase sanity snapshot (2026-04-20): 6 published properties, 5 published
  boats, 0 test-leaks, 0 demo listings under 5 images, 0 demo listings with
  no reviews, all demo listings featured.
- Subagent audit of auth/dashboard/admin/booking/API/navbar flows found no
  demo-breaking issues.
