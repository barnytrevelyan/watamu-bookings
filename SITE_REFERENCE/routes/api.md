# API routes (src/app/api/*)

## Bookings

### POST /api/bookings
- **Purpose**: Guest initiates booking for property or boat
- **Auth**: user-required (guest)
- **Body**: `listingType`, `propertyId | boatId`, `checkIn`, `checkOut`, `tripDate`,
  `guests`, `guestName`, `guestPhone`, `guestMessage`
- **Returns**: `{ bookingId, status, nextStep }`
- **Logic**: validate dates → call `wb_check_property_availability` /
  `wb_check_boat_availability` RPC → detect `billing_mode` → for enquiry (direct):
  generate `enquiry_token`, send host + guest emails; for payment (platform): insert
  with `pending_payment` status

### POST /api/bookings/[id]/respond
- **Purpose**: Host confirms / declines an enquiry (direct mode)
- **Auth**: `enquiry_token` URL param (no login)
- **Body**: `action: 'confirm' | 'decline'`, `decline_reason`
- **Logic**: validate token → update `status` → rotate token → send confirmation /
  decline emails

### GET /api/availability
- **Purpose**: Frontend price breakdown + availability check during booking flow
- **Auth**: public
- **Params**: `propertyId | boatId`, `checkIn`, `checkOut`, `tripDate`
- **Returns**: `{ available, nights, accommodationCost, cleaningFee, serviceFee, total,
  breakdown }`
- **Notes**: subscription-mode listings skip the service fee

## Payments

### POST /api/payments/create-intent
- Stripe PaymentIntent for commission-mode bookings
- Auth: guest (must be the booking guest)
- Body: `bookingId`
- Returns: `{ clientSecret }`

### POST /api/payments/mpesa-stk
- M-Pesa STK push
- Auth: guest
- Body: `bookingId`, `phoneNumber`
- Returns: `{ requestId, message }`

### POST /api/webhooks/stripe
- Stripe event handler (signature-verified)
- On `payment_intent.succeeded` → mark booking confirmed; on `charge.refunded` → mark
  refunded

### POST /api/webhooks/mpesa
- M-Pesa callback (signature-verified)
- Matches against pending `wb_payments` by reference; updates booking/invoice status

## Subscriptions

### POST /api/subscriptions/activate
- Host signs up for subscription billing
- Body: `hostId`, `plan: 'monthly' | 'annual'`
- Logic: trial eligibility check (phone + listing fingerprint anti-abuse) → insert into
  `wb_host_subscriptions` → record `wb_trial_consumed` → `status='trial'` → email

### POST /api/subscriptions/cancel
- Cancel → revert all listings to commission
- Body: `subscriptionId`, `reason`

### POST /api/subscriptions/toggle-listing
- Flip a single listing between subscription and commission
- Body: `listingId`, `listingType`, `newBillingMode`

### POST /api/subscriptions/eligibility-check
- Pre-signup trial eligibility check
- Body: `phone`, `lat`, `lng`, `title`, `address`
- Returns: `{ eligible, reason }`

### POST /api/admin/subscriptions/mark-paid
- Admin override — record payment received offline
- Auth: admin
- Body: `invoiceId`, `payment_method`, `payment_reference`

### POST /api/admin/subscriptions/trial-override
- Admin grants / revokes trial eligibility
- Auth: admin
- Body: `hostId`, `action: 'grant' | 'revoke'`, `reason`

## iCal

### GET /api/ical/feeds
- Auth: owner
- Returns list of signed iCal feed URLs for their listings

### GET /api/ical/export
- Auth: signed URL (public)
- Returns `.ics` with VEVENT entries for confirmed + completed bookings

### POST /api/ical/import
- Auth: owner
- Body: file or calendarUrl
- Logic: parse iCal → create blocked entries in `wb_availability` for non-Watamu
  bookings

## AI Import

### POST /api/import/airbnb
- Scrape Airbnb URL → extract listing data → create draft property/boat → return
  preview

### POST /api/import/booking-com
- Same pattern for Booking.com

### POST /api/import/fishingbooker
- Same pattern for FishingBooker (boat + trips + target species)

### POST /api/import/generic
- Arbitrary URL or HTML → LLM extraction → lower confidence

### POST /api/import/discover
- Crawl a host's own website / social → surface candidate listings for selective
  import

## Cron

### GET /api/cron/billing
- Auth: `CRON_SECRET`
- Nightly: generate invoices via `wb_generate_invoice_number()` +
  `wb_compute_monthly_charge_kes()` → insert → email host; check overdue → transition
  to `grace`; after `grace_period_hours` unpaid → revert all listings to commission

## Chatbot

### POST /api/chat
- **Purpose**: Kwetu site chatbot endpoint. Runs Claude Haiku with five
  read-only tools over the live Supabase data and a small FAQ corpus.
- **Auth**: public (anon), read-only. Phase 2 will gate a second tool set
  behind Supabase auth for host-mode questions.
- **Body**: `{ messages: [{role, content}], turnstile_token?, session_id? }`
- **Returns** (success): `{ reply, tool_trace }`
- **Returns** (Turnstile required): `401 { error, require_turnstile: true, site_key }`
- **Returns** (budget tripped): `429 { error, budget: {spent_usd, cap_usd} }`
- **Abuse controls (stacked)**:
  1. `ANTHROPIC_API_KEY` missing → 503 so the widget can hide.
  2. Per-IP in-memory rate limit (20 msgs / minute / IP).
  3. Cloudflare Turnstile: first message in a browser session must carry a
     valid token. On success the server sets a signed 24h httpOnly cookie
     (`kwetu_chat_verify`) so subsequent turns skip the challenge. Skipped
     when `TURNSTILE_SECRET_KEY` is unset (dev).
  4. Daily USD budget cap (`CHAT_DAILY_BUDGET_USD`, default $5). Each
     turn logs token counts + cost to `wb_events` as `chat_turn`; the sum
     is checked before every request. Failing open on lookup error.
- **Tools surfaced**: `search_listings`, `get_listing`, `check_availability`,
  `get_price`, `search_docs`. Schemas in `src/lib/chatbot/tools.ts`.
  Executors in `src/lib/chatbot/executors.ts`. FAQ corpus in
  `src/lib/chatbot/docs.ts`. System prompt in `src/lib/chatbot/prompt.ts`.
- **Widget**: `src/components/ChatWidget.tsx`. Beta-gated client-side by
  `?chat=1` (sticky via `localStorage.kwetu_chat_beta`). Hidden on the
  `/survey` bare-shell routes.
- **Hard caps**: max 6 tool-use iterations per turn, 20-message history
  window, 1024 output-token cap per Anthropic call.
