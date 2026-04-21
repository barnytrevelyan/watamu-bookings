# Host dashboard routes (/dashboard/*)

All require host authentication. Most guard against "does this host own this listing?"
via RLS + server-side checks.

## /dashboard — Dashboard home

- **File**: `src/app/dashboard/page.tsx`
- **Data**: `wb_properties` (owner's), `wb_boats` (owner's), `wb_bookings` (owner's),
  `wb_reviews`, subscription info
- **Shows**: stat cards (total properties, boats, active bookings, enquiries),
  revenue (this month, last month), average rating; recent bookings; recent reviews;
  CTAs
- **Empty state**: "add first listing" CTA if no listings

## /dashboard/properties — List host's properties

- **File**: `src/app/dashboard/properties/page.tsx`
- Shows each property with status (published/draft/archived), edit/view/delete actions

## /dashboard/properties/new — Create property

- **File**: `src/app/dashboard/properties/new/page.tsx`
- Multi-step form: basic info → rooms (optional) → amenities → images → pricing
- Sets `billing_mode` (commission or subscription); if subscription, also sets
  `deposit_percent`

## /dashboard/properties/[id] — Edit property

- **File**: `src/app/dashboard/properties/[id]/page.tsx`
- Same form pre-filled; image management (upload/reorder/delete); amenity picker;
  pricing

## /dashboard/properties/[id]/rooms — Manage rooms

- **File**: `src/app/dashboard/properties/[id]/rooms/page.tsx`
- Per-room: name, bed count, max guests, price override, description, images

## /dashboard/properties/[id]/analytics — Property analytics

- **File**: `src/app/dashboard/properties/[id]/analytics/page.tsx`
- Bookings over time, revenue by month, occupancy %, top review comments

## /dashboard/boats — List host's boats

- **File**: `src/app/dashboard/boats/page.tsx`

## /dashboard/boats/new — Create boat

- **File**: `src/app/dashboard/boats/new/page.tsx`
- Multi-step: basic info → trips (at least one required) → features → images → pricing

## /dashboard/boats/[id] — Edit boat

- **File**: `src/app/dashboard/boats/[id]/page.tsx`

## /dashboard/bookings — All host bookings

- **File**: `src/app/dashboard/bookings/page.tsx`
- Statuses: `pending_payment | confirmed | completed | cancelled | enquiry | declined`
- Filters by listing, date range, status
- Actions: confirm enquiry, decline with reason, mark completed, cancel/refund, contact
  guest

## /dashboard/reviews — Guest reviews

- **File**: `src/app/dashboard/reviews/page.tsx`
- List sorted by newest/rating; write/edit response; "verified" flag if tied to a
  confirmed booking

## /dashboard/billing — Subscription billing

- **File**: `src/app/dashboard/billing/page.tsx`
- Data: `wb_host_subscriptions`, `wb_subscription_invoices`, `wb_host_billing_summary`
  view
- Shows status (`trial | active | grace | reverted | cancelled`), next billing date,
  amount, past 12 invoices
- Actions: switch monthly↔annual, upgrade tier, cancel

## /dashboard/import — AI-powered listing import

- **File**: `src/app/dashboard/import/page.tsx`
- Paste Airbnb / Booking.com / FishingBooker / generic URL; AI extracts name,
  description, images, amenities, price, capacity; host reviews and confirms
- Backed by `/api/import/*` endpoints

## /dashboard/admin — Admin fast-jump

- **File**: `src/app/dashboard/admin/page.tsx`
- Only visible if host has admin role; typically redirects into `/admin/*`

## /dashboard/analytics — Cross-listing analytics

Aggregated view across all host's properties and boats (revenue, occupancy, ratings).
